import asyncio
import base64
import os
import re
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Literal, Optional
from uuid import uuid4

import httpx
import jwt
import logfire
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

import platogram as plato

logfire.configure()
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/")
async def index():
    return FileResponse("web/index.html")

async def get_auth0_public_key():
    current_time = time.time()

    if (
        auth0_public_key_cache["key"]
        and current_time - auth0_public_key_cache["last_updated"]
        < auth0_public_key_cache["expires_in"]
    ):
        return auth0_public_key_cache["key"]

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
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid audience")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid issuer")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
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
            if not payload.strip():
                raise HTTPException(status_code=400, detail="Empty URL provided")
            logfire.info(f"Payload received: {payload[:100]}...")
            request = ConversionRequest(payload=payload, lang=lang)
        elif file is not None:
            logfire.info(f"File received: {file.filename}")
            tmpdir = Path(tempfile.gettempdir()) / "platogram_uploads"
            tmpdir.mkdir(parents=True, exist_ok=True)
            file_ext = file.filename.split(".")[-1]
            temp_file = Path(tmpdir) / f"{uuid4()}.{file_ext}"
            file_content = await file.read()
            with open(temp_file, "wb") as fd:
                fd.write(file_content)

            request = ConversionRequest(payload=f"file://{temp_file}", lang=lang)
        else:
            raise HTTPException(status_code=400, detail="No input provided")

        tasks[user_id] = Task(start_time=datetime.now(), request=request)
        background_tasks.add_task(convert_and_send_with_error_handling, request, user_id)
        logfire.info(f"Conversion started for user {user_id}")
        return {"message": "Conversion started"}
    except Exception as e:
        logfire.exception(f"Error in convert endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
async def status(user_id: str = Depends(verify_token_and_get_user_id)) -> dict:
    try:
        if user_id not in tasks:
            return {"status": "idle"}
        task = tasks[user_id]
        return {"status": task.status, "error": task.error if task.status == "failed" else None}
    except Exception as e:
        logfire.exception(f"Error in status endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
        logfire.info(f"Starting conversion for user {user_id[:5]}...")  # Log only first 5 chars of user_id
        await convert_and_send(request, user_id)
        logfire.info(f"Conversion completed successfully for user {user_id[:5]}")
        tasks[user_id].status = "done"
    except Exception as e:
        logfire.error(f"Error in background task for user {user_id[:5]}: {type(e).__name__}")
        logfire.error(f"Error details: {str(e)}")
        logfire.exception("Full traceback:")
        tasks[user_id].error = f"{type(e).__name__}: {str(e)}"
        tasks[user_id].status = "failed"

async def convert_and_send(request: ConversionRequest, user_id: str):
    try:
        logfire.info(f"Starting conversion for user {user_id}")

        language_model = plato.llm.get_model("anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY'))
        speech_recognition_model = plato.asr.get_model("assembly-ai/best", os.getenv('ASSEMBLYAI_API_KEY'))

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

    except Exception as e:
        logfire.exception(f"Conversion failed for user {user_id}: {str(e)}")
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
