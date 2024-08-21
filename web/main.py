import asyncio
import base64
import os
import logging
import re
import tempfile
from pathlib import Path
import time
import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from uuid import uuid4
import io

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

import platogram as plato
from anthropic import AnthropicError
import assemblyai as aai

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

# Resend API key
RESEND_API_KEY = os.getenv('RESEND_API_KEY')
if not RESEND_API_KEY:
    raise EnvironmentError("RESEND_API_KEY not set in environment")

# Auth0 Configuration
AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN')
API_AUDIENCE = os.getenv('API_AUDIENCE')
ALGORITHMS = ["RS256"]
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

# Cache for the Auth0 public key
auth0_public_key_cache = {
    "key": None,
    "last_updated": 0,
    "expires_in": 3600,  # Cache expiration time in seconds (1 hour)
}

# Configure AssemblyAI
aai.settings.api_key = os.getenv('ASSEMBLYAI_API_KEY')

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()

async def get_auth0_public_key():
    current_time = time.time()
    if (
        auth0_public_key_cache["key"]
        and current_time - auth0_public_key_cache["last_updated"]
        < auth0_public_key_cache["expires_in"]
    ):
        return auth0_public_key_cache["key"]

    logger.info("Fetching new Auth0 public key")
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

async def verify_token_and_get_email(token: str):
    if not token:
        logger.debug("No token provided")
        return None
    try:
        logger.debug(f"Verifying token: {token[:10]}...{token[-10:]}")
        public_key = await get_auth0_public_key()
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        logger.debug(f"Token payload: {payload}")
        email = payload.get("platogram:user_email") or payload.get("email") or payload.get("https://platogram.com/user_email")
        logger.debug(f"Extracted email from token: {email}")
        return email
    except jwt.ExpiredSignatureError:
        logger.error("Token has expired")
    except jwt.InvalidAudienceError:
        logger.error(f"Invalid audience. Expected: {API_AUDIENCE}")
    except jwt.InvalidIssuerError:
        logger.error(f"Invalid issuer. Expected: https://{AUTH0_DOMAIN}/")
    except Exception as e:
        logger.error(f"Couldn't verify token: {str(e)}")
    return None

async def send_email_with_resend(to_email: str, subject: str, body: str, attachments: list[Path]):
    logger.debug(f"Attempting to send email to: {to_email}")
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "from": "Platogram <onboarding@resend.dev>",
        "to": to_email,
        "subject": subject,
        "text": body,
        "attachments": []
    }

    for attachment in attachments:
        with open(attachment, "rb") as file:
            content = file.read()
            encoded_content = base64.b64encode(content).decode('utf-8')
            payload["attachments"].append({
                "filename": attachment.name,
                "content": encoded_content
            })

    logger.debug(f"Sending email with payload: {json.dumps(payload, default=str)}")
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        logger.info(f"Email sent successfully to {to_email}")
    else:
        logger.error(f"Failed to send email. Status: {response.status_code}, Error: {response.text}")

async def process_and_send_email(task_id: str):
    try:
        task = tasks[task_id]
        user_email = task.get('email')
        logger.debug(f"Processing task {task_id}. Task data: {task}")
        logger.debug(f"User email for task {task_id}: {user_email}")

        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)

            # Initialize Platogram models
            language_model = plato.llm.get_model(
                "anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY')
            )

            # Create the Transcriber object
            speech_recognition_model = aai.Transcriber()

            # Process audio
            if 'url' in task:
                url = task['url']
            else:
                url = f"file://{task['file']}"

            # Check if it's a local file
            if url.startswith("file://"):
                with open(task['file'], 'rb') as audio_file:
                    audio_content = audio_file.read()
                logger.debug(f"Read binary data, length: {len(audio_content)} bytes")

                try:
                    transcribe_response = speech_recognition_model.transcribe(audio_content)
                except UnicodeDecodeError as e:
                    logger.error(f"UnicodeDecodeError during transcription for task {task_id}: {str(e)}")
                    tasks[task_id]['status'] = 'failed'
                    tasks[task_id]['error'] = "Failed to decode byte data - potential encoding issue."
                    return
            else:
                try:
                    transcribe_response = speech_recognition_model.transcribe(url)
                except Exception as e:
                    if "Sign in to confirm you're not a bot" in str(e):
                        logger.error(f"Authentication required for task {task_id}: {str(e)}")
                        tasks[task_id]['status'] = 'failed'
                        tasks[task_id]['error'] = "YouTube requires authentication for this video. Please try a different video or provide a direct audio file."
                        return
                    else:
                        logger.error(f"Error during transcription for task {task_id}: {str(e)}")
                        raise

            transcript = transcribe_response['text']
            content = plato.index(transcript, language_model)

            # Generate output files
            plato.generate_output_files(content, output_dir)

            files = [f for f in output_dir.glob('*') if f.is_file()]

            subject = f"[Platogram] {content.title}"
            body = f"""Hi there!

Platogram transformed spoken words into documents you can read and enjoy, or attach to ChatGPT/Claude/etc and prompt!

You'll find two PDF documents attached: full version, with original transcript and references, and a simplified version, without the transcript and references. I hope this helps!

{content.summary}

Please reply to this e-mail if any suggestions, feedback, or questions.

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

            if user_email:
                logger.debug(f"Sending email to {user_email}")
                await send_email_with_resend(user_email, subject, body, files)
                logger.debug("Email sent successfully")
            else:
                logger.warning(f"No email available for task {task_id}. Skipping email send.")

        tasks[task_id]['status'] = 'done'
        logger.debug(f"Conversion completed for task {task_id}")

    except UnicodeDecodeError as e:
        logger.error(f"UnicodeDecodeError for task {task_id}: {str(e)}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = "Failed to decode byte data - potential encoding issue."
    except Exception as e:
        logger.error(f"Error in process_and_send_email for task {task_id}: {str(e)}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)

@app.post("/api/convert")
async def convert(request: Request, background_tasks: BackgroundTasks):
    logger.debug("Handling /convert request")
    content_type = request.headers.get('Content-Type')
    auth_header = request.headers.get('Authorization', '')
    user_email = await verify_token_and_get_email(auth_header.split(' ')[1] if auth_header else None)
    logger.debug(f"User email for conversion: {user_email}")

    try:
        task_id = str(uuid4())
        if content_type == 'application/octet-stream':
            body = await request.body()
            file_name = request.headers.get('X-File-Name')
            lang = request.headers.get('X-Language', 'en')

            # Save the file to a temporary location
            temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file = temp_dir / f"{task_id}_{file_name}"
            with open(temp_file, 'wb') as f:
                f.write(body)

            tasks[task_id] = {'status': 'running', 'file': str(temp_file), 'lang': lang, 'email': user_email}
            logger.debug(f"File upload received: {file_name}, Language: {lang}, Task ID: {task_id}, User Email: {user_email}")
        elif content_type == 'application/json':
            data = await request.json()
            url = data.get('url')
            lang = data.get('lang', 'en')
            tasks[task_id] = {'status': 'running', 'url': url, 'lang': lang, 'email': user_email}
            logger.debug(f"URL conversion request received: {url}, Language: {lang}, Task ID: {task_id}, User Email: {user_email}")
        else:
            logger.error(f"Invalid content type: {content_type}")
            return JSONResponse(status_code=400, content={"error": "Invalid content type"})

        # Start processing
        tasks[task_id]['status'] = 'processing'
        background_tasks.add_task(process_and_send_email, task_id, convert_and_send_with_error_handling)

        return JSONResponse(status_code=200, content={"message": "Conversion started", "task_id": task_id})
    except Exception as e:
        logger.error(f"Error in handle_convert: {str(e)}")
        return JSONResponse(status_code=500, content={"error": str(e)})

    async def convert_and_send_with_error_handling(task_id: str):
        try:
            await process_and_send_email(task_id)
            tasks[task_id]['status'] = "done"
        except Exception as e:
            logger.exception(f"Error in background task for task {task_id}: {str(e)}")

            error = str(e)
            # Truncate and simplify error message for user-friendly display
            model = plato.llm.get_model("anthropic/claude-3-5-sonnet", key=os.getenv("ANTHROPIC_API_KEY"))
            error = model.prompt_model(messages=[
                plato.types.User(
                    content=f"""
                    Given the following error message, provide a concise, user-friendly explanation
                    that focuses on the key issue and any actionable steps. Avoid technical jargon
                    and keep the message under 256 characters:

                    Error: {error}
                    """
                )
            ])

            error = error.strip()  # Remove any leading/trailing whitespace
            tasks[task_id]['error'] = error
            tasks[task_id]['status'] = "failed"

@app.get("/api/status")
async def status(request: Request):
    task_id = request.headers.get('X-Task-ID')
    if not task_id:
        return JSONResponse(status_code=200, content={"status": "idle"})

    try:
        if task_id not in tasks:
            response = {"status": "not_found"}
        else:
            task = tasks[task_id]
            response = {
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }
        return JSONResponse(status_code=200, content=response)
    except Exception as e:
        logger.error(f"Error in handle_status for task {task_id}: {str(e)}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/reset")
async def reset(request: Request):
    task_id = request.headers.get('X-Task-ID')
    if not task_id:
        return JSONResponse(status_code=400, content={"error": "Task ID required"})

    try:
        if task_id in tasks:
            del tasks[task_id]
        return JSONResponse(status_code=200, content={"message": "Task reset"})
    except Exception as e:
        logger.error(f"Error in handle_reset for task {task_id}: {str(e)}")
        return JSONResponse(status_code=500, content={"error": str(e)})

def handler(request, context):
    return app(request, context)