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
from sanic.response import json, text, stream, file, redirect
from sanic.exceptions import SanicException
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

app = Sanic("PlatogramApp")

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

AUTH0_DOMAIN = "dev-w0dm4z23pib7oeui.us.auth0.com"
API_AUDIENCE = "https://platogram.vercel.app/"
ALGORITHMS = ["RS256"]
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

tasks = {}
processes = {}
Language = Literal["en", "es"]

# Cache for the Auth0 public key
auth0_public_key_cache = {
    "key": None,
    "last_updated": 0,
    "expires_in": 3600,  # Cache expiration time in seconds (1 hour)
}

@app.exception(Exception)
async def global_exception_handler(request, exception):
    logfire.exception(f"An error occurred: {str(exception)}")
    logger.exception(f"An error occurred: {str(exception)}")
    return json({"message": "An internal error occurred", "detail": str(exception)}, status=500)

@app.route('/')
async def root(request):
    return redirect('/web/index.html')

@app.route('/web/')
async def web_root(request):
    return await file('static/index.html')

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

async def verify_token_and_get_user_id(request):
    token = request.token
    if not token:
        raise SanicException("No token provided", status_code=401)
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
        raise SanicException("Token has expired", status_code=401)
    except jwt.InvalidAudienceError as e:
        logger.warning(f"Token audience verification failed: {str(e)}")
        raise SanicException(f"Token audience verification failed: {str(e)}", status_code=401)
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise SanicException(f"Invalid token: {str(e)}", status_code=401)
    except Exception as e:
        logger.error(f"Couldn't verify token: {str(e)}")
        raise SanicException(f"Couldn't verify token: {str(e)}", status_code=401)

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

                chunk = request.body
                with open(temp_file, 'ab') as f:
                    f.write(chunk)

                await response.write(f"Chunk {chunk_index + 1} written to temp storage\n".encode())

                if chunk_index == total_chunks - 1:
                    final_file = temp_dir / file_name
                    temp_file.rename(final_file)
                    await response.write(f"File {file_name} received completely. Finalizing...\n".encode())
                    # Here you would typically start processing the file
                    # For now, we'll just simulate processing
                    await asyncio.sleep(1)
                    await response.write(b"File processing started in background.\n")

            elif content_type == 'application/json':
                data = request.json
                url = data.get('url')
                lang_data = data.get('lang', 'en')
                logger.debug(f"Received URL: {url}, language: {lang_data}")
                await response.write(f"Received URL: {url}. Initializing processing...\n".encode())
                # Here you would typically start processing the URL
                # For now, we'll just simulate processing
                await asyncio.sleep(1)
                await response.write(b"URL processing started in background.\n")

            else:
                await response.write("Invalid content type\n".encode())
                raise SanicException("Invalid content type", status_code=400)

            await response.write(b"Initial response sent. Conversion process started in background.\n")

        except Exception as e:
            logger.error(f"Error in process_and_stream: {str(e)}")
            await response.write(f"Error: {str(e)}\n".encode())

    return stream(process_and_stream, content_type='text/plain')

@app.get("/status")
async def status(request):
    user_id = await verify_token_and_get_user_id(request)
    try:
        if user_id not in tasks:
            return json({"status": "idle"})
        task = tasks[user_id]
        return json({"status": task['status'], "error": task['error'] if task['status'] == "failed" else None})
    except Exception as e:
        logfire.exception(f"Error in status endpoint: {str(e)}")
        logger.exception(f"Error in status endpoint: {str(e)}")
        raise SanicException(str(e), status_code=500)

@app.get("/test-auth")
async def test_auth(request):
    user_id = await verify_token_and_get_user_id(request)
    return json({"message": "Auth test successful", "user_id": user_id})

@app.get("/reset")
@logfire.instrument()
async def reset(request):
    user_id = await verify_token_and_get_user_id(request)
    try:
        if user_id in processes:
            processes[user_id].terminate()
            del processes[user_id]

        if user_id in tasks:
            del tasks[user_id]

        return json({"message": "Session reset"})
    except Exception as e:
        logfire.exception(f"Error in reset endpoint for user {user_id}: {str(e)}")
        logger.exception(f"Error in reset endpoint for user {user_id}: {str(e)}")
        raise SanicException(f"Failed to reset session: {str(e)}", status_code=500)
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
    # Simulating file processing
    steps = ["Initializing", "Processing", "Finalizing"]
    for step in steps:
        yield f"{step}...\n"
        await asyncio.sleep(1)  # Simulate work
    yield f"File {file_path} processed with language {lang}\n"

async def process_url(url: str, lang: str):
    # Simulating URL processing
    steps = ["Fetching URL", "Analyzing Content", "Converting"]
    for step in steps:
        yield f"{step}...\n"
        await asyncio.sleep(1)  # Simulate work
    yield f"URL {url} processed with language {lang}\n"

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

    # Vercel handler
def handler(request, response):
    if request.path.startswith('/convert'):
        return sanic_app.handle_request(request)
    else:
        return app(request.environ, response.start_response)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=60)  # Set timeout to Vercel Hobby Plan max 60 seconds