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
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from typing import Literal, Optional
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from fastapi import FastAPI, Depends, HTTPException, UploadFile, Form, File, BackgroundTasks, Request
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer
from concurrent.futures import ProcessPoolExecutor
from platogram import llm, asr

import platogram as plato

# Setup logging
logger = logging.getLogger("platogram")
logger.setLevel(logging.DEBUG)
ch = logging.StreamHandler()
ch.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

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
    lang: Language = "en"

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
async def convert(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(verify_token_and_get_user_id),
    file: Optional[UploadFile] = File(None),
    payload: Optional[str] = Form(None),
    lang: Optional[Language] = Form(None),
):
    try:
        logfire.info(f"Convert request received for user {user_id}")
        if not lang:
            lang = "en"

        if user_id in tasks and tasks[user_id].status == "running":
            raise HTTPException(status_code=400, detail="Conversion already in progress")

        if payload is None and file is None:
            raise HTTPException(status_code=400, detail="Either payload or file must be provided")

        if payload is not None:
            logfire.info(f"Payload received: {payload[:100]}...")  # Log first 100 chars of payload
            request = ConversionRequest(payload=payload, lang=lang)
        else:
            logfire.info(f"File received: {file.filename}")
            tmpdir = Path(tempfile.gettempdir()) / "platogram_uploads"
            tmpdir.mkdir(parents=True, exist_ok=True)
            file_ext = file.filename.split(".")[-1]
            temp_file = Path(tmpdir) / f"{uuid4()}.{file_ext}"
            file_content = await file.read()
            with open(temp_file, "wb") as fd:
                fd.write(file_content)

            request = ConversionRequest(payload=f"file://{temp_file}", lang=lang)

        tasks[user_id] = Task(start_time=datetime.now(), request=request)
        background_tasks.add_task(convert_and_send_with_error_handling, request, user_id)
        logfire.info(f"Conversion started for user {user_id}")
        return JSONResponse(content={"message": "Conversion started"}, status_code=200)
    except Exception as e:
        logfire.exception(f"Error in convert endpoint: {str(e)}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

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
    finally:
        if user_id in processes:
            del processes[user_id]

    if process.returncode != 0:
        raise RuntimeError(f"Failed to execute {command} with return code {process.returncode}.\n\nstdout:\n{stdout.decode()}\n\nstderr:\n{stderr.decode()}")

    return stdout.decode(), stderr.decode()

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
        llm = plato.llm.get_model("anthropic/claude-3-5-sonnet", ANTHROPIC_API_KEY)
        asr = plato.asr.get_model("assembly-ai/best", ASSEMBLYAI_API_KEY)

        url = request.payload

        # Process audio
        transcript = plato.extract_transcript(url, asr)
        content = plato.index(transcript, llm)

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
    smtp_user = os.getenv("PLATOGRAM_SMTP_USER")
    smtp_server = os.getenv("PLATOGRAM_SMTP_SERVER")
    smtp_port = 587
    sender_password = os.getenv("PLATOGRAM_SMTP_PASSWORD")
    
    msg = MIMEMultipart()
    msg['From'] = os.getenv("PLATOGRAM_SMTP_FROM")
    msg['To'] = user_id
    msg['Subject'] = subj
    
    msg.attach(MIMEText(body, 'plain'))
    
    for file in files:
        with open(file, "rb") as f:
            file_name = file.name.split("/")[-1]
            part = MIMEApplication(f.read(), Name=file_name)
            part['Content-Disposition'] = f'attachment; filename="{file_name}"'
            msg.attach(part)
    
    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, sender_password)
        server.send_message(msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)