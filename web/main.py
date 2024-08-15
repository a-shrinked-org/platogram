import asyncio
import os
import re
import smtplib
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
    UploadFile,
    Request,
)
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Logfire configuration
logfire_token = os.getenv('LOGFIRE_TOKEN')
if logfire_token:
    logfire.configure(token=logfire_token)
else:
    try:
        logfire.configure()
    except Exception as e:
        print(f"Logfire configuration failed: {e}")

app = FastAPI()

AUTH0_DOMAIN = "dev-w0dm4z23pib7oeui.us.auth0.com"
API_AUDIENCE = "https://platogram.vercel.app"
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
    print(f"An error occurred: {str(exc)}")
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
        print(f"Token payload: {payload}")  # Log entire payload
        user_id = payload.get("sub") or payload.get("platogram:user_email")
        if not user_id:
            raise ValueError("User ID not found in token payload")
        return user_id
    except jwt.ExpiredSignatureError:
        print("Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTClaimsError as e:
        print(f"Invalid claims: {e}")
        raise HTTPException(status_code=401, detail="Invalid token claims")
    except Exception as e:
        print(f"Token verification error: {str(e)}")
        raise HTTPException(status_code=401, detail="Couldn't verify token") from e

@app.post("/convert")
@logfire.instrument()
async def convert(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(verify_token_and_get_user_id),
    file: Optional[UploadFile] = File(None),
    payload: Optional[str] = Form(None),
    lang: Optional[Language] = Form(None),
):
    if not lang:
        lang = "en"

    if user_id in tasks and tasks[user_id].status == "running":
        raise HTTPException(status_code=400, detail="Conversion already in progress")

    if payload is None and file is None:
        raise HTTPException(status_code=400, detail="Either payload or file must be provided")

    if payload is not None:
        request = ConversionRequest(payload=payload, lang=lang)
    else:
        # Create a named temporary directory if it doesn't exist
        tmpdir = Path(tempfile.gettempdir()) / "platogram_uploads"
        tmpdir.mkdir(parents=True, exist_ok=True)
        file_ext = file.filename.split(".")[-1]
        temp_file = Path(tmpdir) / f"{uuid4()}.{file_ext}" 
        file_content = await file.read()
        with open(temp_file, "wb") as fd:
            fd.write(file_content)
            fd.close()

        request = ConversionRequest(payload=f"file://{temp_file}", lang=lang)

    tasks[user_id] = Task(start_time=datetime.now(), request=request)
    background_tasks.add_task(convert_and_send_with_error_handling, request, user_id)
    return {"message": "Conversion started"}

@app.get("/status")
async def status(user_id: str = Depends(verify_token_and_get_user_id)) -> dict:
    try:
        if user_id not in tasks:
            return {"status": "idle"}
        task = tasks[user_id]
        if task.status == "running":
            return {"status": "running"}
        if task.status == "failed":
            return {"status": "failed", "error": task.error}
        if task.status == "done":
            return {"status": "done"}
        return {"status": "idle"}  # fallback to idle
    pass
except Exception as e:
        logfire.exception(f"Error in status endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def verify_token(token: str = Depends(oauth2_scheme)):
    try:
        # Assuming `is_token_valid` is an actual function you have for token validation
        if not is_token_valid(token):
            raise HTTPException(status_code=401, detail="Unauthorized")
        return token
    except Exception as e:
        print(f"Token verification error in verify_token: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized") from e

@app.get("/test-auth")
async def test_auth(token: str = Depends(verify_token)):
    return {"message": "Auth test successful"}

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
        raise RuntimeError(f"""Failed to execute {command} with return code {process.returncode}.

stdout:
{stdout.decode()}

stderr:
{stderr.decode()}""")

    return stdout.decode(), stderr.decode()

async def send_email(user_id: str, subj: str, body: str, files: list[Path]):
    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor() as pool:
        await loop.run_in_executor(pool, _send_email_sync, user_id, subj, body, files)

async def convert_and_send_with_error_handling(request: ConversionRequest, user_id: str):
    try:
        await convert_and_send(request, user_id)
        tasks[user_id].status = "done"
    except Exception as e:
        logfire.exception(f"Error in background task for user {user_id}: {str(e)}")
        if user_id in tasks:
            error = str(e)
            if len(error) > 256:
                error = "🤯🤯🤯"
            tasks[user_id].error = error
            tasks[user_id].status = "failed"

async def convert_and_send(request: ConversionRequest, user_id: str):
    with tempfile.TemporaryDirectory() as tmpdir:
        if not (request.payload.startswith("http") or request.payload.startswith("file:///tmp/platogram_uploads")):
            raise HTTPException(status_code=400, detail="Please provide a valid URL.")
        else:
            url = request.payload

        try:
            stdout, stderr = await audio_to_paper(url, request.lang, Path(tmpdir), user_id)
        finally:
            if request.payload.startswith("file:///tmp/platogram_uploads"):
                try:
                    os.remove(request.payload.replace("file:///tmp/platogram_uploads", "/tmp/platogram_uploads"))
                except OSError as e:
                    logfire.warning(f"Failed to delete temporary file {request.payload}: {e}")

        title_match = re.search(r'<title>(.*?)</title>', stdout, re.DOTALL)
        if title_match:
            title = title_match.group(1).strip()
        else:
            title = "👋"
            logfire.warning("No title found in stdout, using default title")

        abstract_match = re.search(r'<abstract>(.*?)</abstract>', stdout, re.DOTALL)
        if abstract_match:
            abstract = abstract_match.group(1).strip()
        else:
            abstract = ""
            logfire.warning("No abstract found in stdout, using default abstract")

        files = [f for f in Path(tmpdir).glob('*') if f.is_file()]

        subject = f"[Platogram] {title}"
        body = f"""Hi there!

Platogram transformed spoken words into documents you can read and enjoy, or attach to ChatGPT/Claude/etc and prompt!

You'll find a PDF and a Word file attached. The Word file includes the original transcript with timestamp references. I hope this helps!

{abstract}

Please reply to this e-mail if any suggestions, feedback, or questions.

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

        await send_email(user_id, subject, body, files)

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