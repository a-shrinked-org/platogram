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
import yt_dlp
from flask import Flask, request
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from typing import Literal, Optional
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate

from fastapi import FastAPI, Depends, HTTPException, UploadFile, Form, File, BackgroundTasks, Request
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from starlette.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer
from concurrent.futures import ProcessPoolExecutor

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

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

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

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

AUTH0_DOMAIN = "dev-w0dm4z23pib7oeui.us.auth0.com"
API_AUDIENCE = "https://platogram.vercel.app/"
ALGORITHMS = ["RS256"]
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

tasks = {}
processes = {}
Language = Literal["en", "es"]

class ConversionRequest(BaseModel):
    payload: str
    lang: str = "en"

class Task(BaseModel):
    start_time: datetime
    request: ConversionRequest
    status: Literal["running", "done", "failed"] = "running"
    error: Optional[str] = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Cache for the Auth0 public key
auth0_public_key_cache = {
    "key": None,
    "last_updated": 0,
    "expires_in": 3600,  # Cache expiration time in seconds (1 hour)
}

# Serve static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/web", StaticFiles(directory=static_dir), name="static")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logfire.exception(f"An error occurred: {str(exc)}")
    logger.exception(f"An error occurred: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"message": "An internal error occurred", "detail": str(exc)}
    )

@app.get("/")
async def root():
    return RedirectResponse(url="/web/index.html")

@app.get("/web/")
async def web_root():
    return FileResponse(os.path.join(static_dir, "index.html"))

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

async def verify_token_and_get_user_id(token: str = Depends(oauth2_scheme)):
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
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidAudienceError as e:
        logger.warning(f"Token audience verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Token audience verification failed: {str(e)}")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        logger.error(f"Couldn't verify token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Couldn't verify token: {str(e)}") from e

@app.post("/convert")
@logfire.instrument()
async def convert(request: Request):
    async def process_and_stream():
        try:
            headers = request.headers
            content_type = headers.get('content-type', '')

            if content_type == 'application/octet-stream':
                # File upload
                file_name = headers.get('X-File-Name')
                chunk_index = int(headers.get('X-Chunk-Index', 0))
                total_chunks = int(headers.get('X-Total-Chunks', 1))
                lang = headers.get('X-Language', 'en')

                temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file = temp_dir / f"{file_name}.part"

                chunk = await request.body()

                with open(temp_file, 'ab') as f:
                    f.write(chunk)

                yield f"Received chunk {chunk_index + 1} of {total_chunks}\n".encode()

                if chunk_index == total_chunks - 1:
                    # All chunks received, process the file
                    final_file = temp_dir / file_name
                    temp_file.rename(final_file)
                    yield f"File {file_name} received completely. Processing...\n".encode()
                    # Add your file processing logic here
                    # Call the long-running task in the background
                    await process_file(final_file, lang)

            elif content_type == 'application/json':
                # URL processing
                data = await request.json()
                url = data.get('url')
                lang = data.get('lang', 'en')
                yield f"Received URL: {url}. Processing...\n".encode()
                # Add your URL processing logic here
                # Call the long-running task in the background
                await process_url(url, lang)

            else:
                raise HTTPException(status_code=400, detail="Invalid content type")

            # Simulate processing steps
            for step in ["Analyzing", "Converting", "Finalizing"]:
                await asyncio.sleep(1)  # Simulate work
                yield f"{step}...\n".encode()

            yield b"Conversion process initiated. You will receive an email when it's complete.\n"

        except Exception as e:
            yield f"Error: {str(e)}\n".encode()

    return StreamingResponse(process_and_stream(), media_type="text/plain")

@app.get("/status")
async def status(user_id: str = Depends(verify_token_and_get_user_id)) -> dict:
    try:
        if user_id not in tasks:
            return {"status": "idle"}
        task = tasks[user_id]
        return {"status": task.status, "error": task.error if task.status == "failed" else None}
    except Exception as e:
        logfire.exception(f"Error in status endpoint: {str(e)}")
        logger.exception(f"Error in status endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test-auth")
async def test_auth(user_id: str = Depends(verify_token_and_get_user_id)):
    return {"message": "Auth test successful", "user_id": user_id}

@app.get("/reset")
@logfire.instrument()
async def reset(user_id: str = Depends(verify_token_and_get_user_id)):
    try:
        if user_id in processes:
            processes[user_id].terminate()
            del processes[user_id]

        if user_id in tasks:
            del tasks[user_id]

        return {"message": "Session reset"}
    except Exception as e:
        logfire.exception(f"Error in reset endpoint for user {user_id}: {str(e)}")
        logger.exception(f"Error in reset endpoint for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")

async def audio_to_paper(url: str, lang: Language, output_dir: Path, user_id: str) -> tuple[str, str]:
    script_path = Path.cwd() / "examples" / "audio_to_paper.sh"
    command = f"cd {output_dir} && {script_path} \"{url}\" --lang {lang} --verbose"

    if user_id in processes:
        raise RuntimeError("Conversion already in progress.")

    process = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        shell=True
    )
    processes[user_id] = process

    try:
        stdout, stderr = await process.communicate()
        logger.debug(f"Process stdout: {stdout.decode()}")
        logger.debug(f"Process stderr: {stderr.decode()}")
    finally:
        if user_id in processes:
            del processes[user_id]

    if process.returncode != 0:
        raise RuntimeError(f"Failed to execute {command} with return code {process.returncode}.\n\nstdout:\n{stdout.decode()}\n\nstderr:\n{stderr.decode()}")

    return stdout.decode(), stderr.decode()

async def process_file(file_path: Path, lang: str):
    logger.debug(f"Processing file: {file_path}, language: {lang}")
    # Implement your file processing logic here
    # Simulate a delay to mock long processing
    await asyncio.sleep(2)
    logger.debug(f"File processed: {file_path}")

async def process_url(url: str, lang: str):
    logger.debug(f"Processing URL: {url}, language: {lang}")
    # Implement your URL processing logic here
    # Simulate a delay to mock long processing
    await asyncio.sleep(2)
    logger.debug(f"URL processed: {url}")

async def send_email(user_id: str, subj: str, body: str, files: list[Path]):
    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor() as pool:
        await loop.run_in_executor(pool, _send_email_sync, user_id, subj, body, files)

async def convert_and_send_with_error_handling(request: ConversionRequest, user_id: str):
    try:
        await convert_and_send(request, user_id)
        tasks[user_id].status = "done"
    except HTTPException as e:
        logfire.exception(f"HTTP error in background task for user {user_id}: {str(e)}")
        logger.exception(f"HTTP error in background task for user {user_id}: {str(e)}")
        tasks[user_id].error = str(e)
        tasks[user_id].status = "failed"
    except Exception as e:
        logfire.exception(f"Unexpected error in background task for user {user_id}: {str(e)}")
        logger.exception(f"Unexpected error in background task for user {user_id}: {str(e)}")
        tasks[user_id].error = "An unexpected error occurred"
        tasks[user_id].status = "failed"

async def convert_and_send(request: ConversionRequest, user_id: str):
    try:
        logger.info(f"Starting conversion for user {user_id}")

        # Initialize models
        language_model = plato.llm.get_model("anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY'))
        speech_recognition_model = plato.asr.get_model("assembly-ai/best", os.getenv('ASSEMBLYAI_API_KEY'))

        # Process audio
        try:
            transcript = plato.extract_transcript(request.payload, speech_recognition_model)
        except Exception as e:
            if "Sign in to confirm you're not a bot" in str(e):
                raise HTTPException(status_code=400, detail="YouTube requires authentication for this video. Please try a different video or provide a direct audio file.")
            else:
                raise

        content = plato.index(transcript, language_model)

        title = content.title
        summary = content.summary

        with tempfile.TemporaryDirectory() as tmpdir:
            files = [f for f in Path(tmpdir).glob('*') if f.is_file()]

            subject = f"[Platogram] {title}"
            body = f"""Hi there!

Platogram transformed spoken words into documents you can read and enjoy, or attach to ChatGPT/Claude/etc and prompt!

You'll find a PDF and a Word file attached. The Word file includes the original transcript with timestamp references. I hope this helps!

{summary}

Please reply to this e-mail if any suggestions, feedback, or questions.

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

            await send_email(user_id, subject, body, files)

    except ImportError as e:
        logger.exception(f"Import error for user {user_id}: {str(e)}")
        logfire.exception(f"Import error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Import error: {str(e)}. Please contact support.")
    except Exception as e:
        logger.exception(f"Conversion failed for user {user_id}: {str(e)}")
        logfire.exception(f"Conversion and sending failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to convert and send transcript: {str(e)}")

def _send_email_sync(user_id: str, subj: str, body: str, files: list[Path]):
    logger.debug("Starting _send_email_sync function")

    smtp_user = os.getenv("PLATOGRAM_SMTP_USER")
    smtp_server = os.getenv("PLATOGRAM_SMTP_SERVER")
    smtp_port = 587
    sender_password = os.getenv("PLATOGRAM_SMTP_PASSWORD")
    
    logger.debug(f"SMTP User: {smtp_user}, Server: {smtp_server}, Port: {smtp_port}")

    msg = MIMEMultipart()
    msg['From'] = os.getenv("PLATOGRAM_SMTP_FROM")
    msg['To'] = user_id
    msg['Subject'] = subj
    
    msg.attach(MIMEText(body, 'plain'))
    logger.debug(f"Prepared email body: {body}")
    
    for file in files:
        logger.debug(f"Attaching file: {file}")
        try:
            with open(file, "rb") as f:
                file_name = file.name.split("/")[-1]
                part = MIMEApplication(f.read(), Name=file_name)
                part['Content-Disposition'] = f'attachment; filename="{file_name}"'
                msg.attach(part)
            logger.debug(f"Successfully attached file: {file_name}")
        except Exception as e:
            logger.error(f"Error attaching file {file}: {str(e)}")
    
    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            logger.debug("Started TLS connection")
            server.login(smtp_user, sender_password)
            logger.debug("Logged into SMTP server")
            server.send_message(msg)
            logger.debug(f"Email sent to {user_id} with subject {subj}")
    except Exception as e:
        logger.error(f"Failed to send email to {user_id}: {str(e)}")

    logger.debug("Ending _send_email_sync function")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=120)  # Increased timeout