import os
import re
import jwt
import asyncio
import httpx
import tempfile
import logfire
import time
import smtplib
import logging

from sanic import Sanic
from sanic.response import stream
from sanic.request import Request
import aiofiles
import yt_dlp

from pathlib import Path
from uuid import uuid4
from datetime import datetime
from typing import Literal, Optional
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate

import platogram as plato
from platogram import llm, asr

# Setup logging
logger = logging.getLogger("platogram")
logger.setLevel(logging.DEBUG)
ch = logging.StreamHandler()
ch.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

app = Sanic("ConvertApp")

# Retrieve API keys from environment variables
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
ASSEMBLYAI_API_KEY = os.getenv('ASSEMBLYAI_API_KEY')

if not ANTHROPIC_API_KEY or not ASSEMBLYAI_API_KEY:
    raise RuntimeError("API keys not set in environment variables.")

# Logfire configuration
logfire_token = os.getenv('LOGFIRE_TOKEN')
if logfire_token:
    logfire.configure(token=logfire_token)
else:
    try:
        logfire.configure()
    except Exception as e:
        logger.error(f"Logfire configuration failed: {e}")

# Add CORS middleware
app.ext.middleware('response')(app.cors())

AUTH0_DOMAIN = "dev-w0dm4z23pib7oeui.us.auth0.com"
API_AUDIENCE = "https://platogram.vercel.app/"
ALGORITHMS = ["RS256"]
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

tasks = {}
processes = {}
Language = Literal["en", "es"]

class ConversionRequest:
    def __init__(self, payload: str, lang: str = "en"):
        self.payload = payload
        self.lang = lang

class Task:
    def __init__(self, start_time: datetime, request: ConversionRequest, status: Literal["running", "done", "failed"] = "running", error: Optional[str] = None):
        self.start_time = start_time
        self.request = request
        self.status = status
        self.error = error

# Cache for the Auth0 public key
auth0_public_key_cache = {
    "key": None,
    "last_updated": 0,
    "expires_in": 3600,  # Cache expiration time in seconds (1 hour)
}

# Serve static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.static("/web", static_dir)

@app.exception(Exception)
async def global_exception_handler(request, exception):
    logfire.exception(f"An error occurred: {str(exception)}")
    logger.exception(f"An error occurred: {str(exception)}")
    return sanic.response.json(
        {"message": "An internal error occurred", "detail": str(exception)},
        status=500
    )

@app.get("/")
async def root(request):
    return sanic.response.redirect("/web/index.html")

@app.get("/web/")
async def web_root(request):
    return sanic.response.file(os.path.join(static_dir, "index.html"))

async def get_auth0_public_key():
    logger.debug("Entering get_auth0_public_key function")
    current_time = time.time()
    if (
        auth0_public_key_cache["key"]
        and current_time - auth0_public_key_cache["last_updated"]
        < auth0_public_key_cache["expires_in"]
    ):
        logger.debug("Returning cached Auth0 public key")
        return auth0_public_key_cache["key"]

    logger.debug("Fetching new Auth0 public key")
    async with httpx.AsyncClient() as client:
        response = await client.get(JWKS_URL)
        response.raise_for_status()
        jwks = response.json()

    x5c = jwks["keys"][0]["x5c"][0]
    cert = load_pem_x509_certificate(
        f"-----BEGIN CERTIFICATE-----\n{x5c}\n-----END CERTIFICATE-----".encode()
    )
    public_key = cert.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    auth0_public_key_cache["key"] = public_key
    auth0_public_key_cache["last_updated"] = current_time

    logger.debug("New Auth0 public key fetched and cached")
    return public_key

async def verify_token_and_get_user_id(token: str):
    try:
        public_key = await get_auth0_public_key()
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise sanic.exceptions.Unauthorized("Token has expired")
    except jwt.InvalidAudienceError as e:
        logger.warning(f"Token audience verification failed: {str(e)}")
        raise sanic.exceptions.Unauthorized(f"Token audience verification failed: {str(e)}")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise sanic.exceptions.Unauthorized(f"Invalid token: {str(e)}")
    except Exception as e:
        logger.error(f"Couldn't verify token: {str(e)}")
        raise sanic.exceptions.Unauthorized(f"Couldn't verify token: {str(e)}") from e

@app.post("/convert")
@logfire.instrument()
async def convert(request):
    async def process_and_stream(response):
        try:
            logger.debug("Starting process_and_stream")

            content_type = request.headers.get('content-type', '')
            logger.debug(f"Content type: {content_type}")

            if content_type == 'application/octet-stream':
                file_name = request.headers.get('X-File-Name')
                chunk_index = int(request.headers.get('X-Chunk-Index', 0))
                total_chunks = int(request.headers.get('X-Total-Chunks', 1))
                lang = request.headers.get('X-Language', 'en')
                logger.debug(f"Received file upload - {file_name}, chunk {chunk_index + 1} of {total_chunks}, language {lang}")
                await response.write(f"Received chunk {chunk_index + 1} of {total_chunks}\n".encode())

                temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file = temp_dir / f"{file_name}.part"

                chunk = await request.body
                with open(temp_file, 'ab') as f:
                    f.write(chunk)

                await response.write(f"Chunk {chunk_index + 1} written to temp storage\n".encode())

                if chunk_index == total_chunks - 1:
                    final_file = temp_dir / file_name
                    temp_file.rename(final_file)
                    await response.write(f"File {file_name} received completely. Finalizing...\n".encode())
                    app.add_task(process_file(final_file, lang))

            elif content_type == 'application/json':
                data = request.json
                url = data.get('url')
                lang_data = data.get('lang', 'en')
                logger.debug(f"Received URL: {url}, language: {lang_data}")
                await response.write(f"Received URL: {url}. Initializing processing...\n".encode())
                app.add_task(process_url(url, lang_data))

            else:
                await response.write("Invalid content type\n".encode())
                raise sanic.exceptions.BadRequest("Invalid content type")

            initial_steps = ["Initializing", "Analyzing"]
            for step in initial_steps:
                logger.debug(f"Executing step: {step}")
                await asyncio.sleep(0.5)
                await response.write(f"{step}...\n".encode())

            logger.debug("Sending initial response within 10 seconds")
            await response.write(b"Initial response sent. Conversion process started in background.\n")

        except Exception as e:
            logger.error(f"Error in process_and_stream: {str(e)}")
            await response.write(f"Error: {str(e)}\n".encode())

    return stream(process_and_stream, content_type='text/plain')

@app.get("/status")
async def status(request):
    user_id = await verify_token_and_get_user_id(request.headers.get("Authorization", "").replace("Bearer ", ""))
    try:
        if user_id not in tasks:
            return {"status": "idle"}
        task = tasks[user_id]
        return {"status": task.status, "error": task.error if task.status == "failed" else None}
    except Exception as e:
        logfire.exception(f"Error in status endpoint: {str(e)}")
        logger.exception(f"Error in status endpoint: {str(e)}")
        raise sanic.exceptions.InternalServerError(str(e))

@app.get("/test-auth")
async def test_auth(request):
    user_id = await verify_token_and_get_user_id(request.headers.get("Authorization", "").replace("Bearer ", ""))
    return {"message": "Auth test successful", "user_id": user_id}

@app.get("/reset")
@logfire.instrument()
async def reset(request):
    user_id = await verify_token_and_get_user_id(request.headers.get("Authorization", "").replace("Bearer ", ""))
    if user_id in tasks:
        del tasks[user_id]
    return {"message": "Session reset"}

async def process_file(file_path: Path, lang: str):
    logger.info(f"Processing file: {file_path} with language: {lang}")
    try:
        async with aiofiles.open(file_path, 'rb') as f:
            # Perform your file processing here
            pass
        logger.info(f"File processed successfully: {file_path}")
        tasks[file_path.stem].status = "done"
    except Exception as e:
        logger.error(f"Error processing file {file_path}: {str(e)}")
        tasks[file_path.stem].status = "failed"
        tasks[file_path.stem].error = str(e)

async def process_url(url: str, lang: str):
    logger.info(f"Processing URL: {url} with language: {lang}")
    try:
        # Perform your URL processing here
        pass
        logger.info(f"URL processed successfully: {url}")
    except Exception as e:
        logger.error(f"Error processing URL {url}: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=60)  # Set timeout to Vercel Hobby Plan max 60 seconds