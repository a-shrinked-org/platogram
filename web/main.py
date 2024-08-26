from http.server import BaseHTTPRequestHandler
import json
import os
import logging
import re
import subprocess
import tempfile
from pathlib import Path
import base64
import time
import requests
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from uuid import uuid4
import threading

import platogram as plato
import assemblyai as aai

# Removed imports:
# from docx import Document
# from reportlab.lib.pagesizes import letter
# from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
# from reportlab.lib.styles import getSampleStyleSheet
# import asyncio
# import aiofiles
# import aiofiles.tempfile
# from reportlab.pdfgen import canvas
# from io import BytesIO
# from anthropic import AnthropicError

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

def json_response(handler, status_code, data):
    handler.send_response(status_code)
    handler.send_header('Content-type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Language')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode('utf-8'))

def get_auth0_public_key():
    current_time = time.time()
    if (
        auth0_public_key_cache["key"]
        and current_time - auth0_public_key_cache["last_updated"]
        < auth0_public_key_cache["expires_in"]
    ):
        return auth0_public_key_cache["key"]

    logger.info("Fetching new Auth0 public key")
    response = requests.get(JWKS_URL)
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

def verify_token_and_get_email(token):
    if not token:
        logger.debug("No token provided")
        return None
    try:
        logger.debug(f"Verifying token: {token[:10]}...{token[-10:]}")
        public_key = get_auth0_public_key()
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

async def send_email_with_resend(to_email, subject, body, attachments):
    logger.info(f"Attempting to send email to: {to_email}")
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
        async with aiofiles.open(attachment, "rb") as file:
            content = await file.read()
            encoded_content = base64.b64encode(content).decode('utf-8')
            payload["attachments"].append({
                "filename": Path(attachment).name,
                "content": encoded_content
            })

    logger.info(f"Sending email with payload: {json.dumps(payload, default=str)}")
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as response:
            if response.status == 200:
                logger.info(f"Email sent successfully to {to_email}")
                logger.debug(f"Resend API response: {await response.text()}")
            else:
                logger.error(f"Failed to send email. Status: {response.status}, Error: {await response.text()}")
                logger.debug(f"Failed payload: {json.dumps(payload, default=str)}")
            return response
def audio_to_paper(url: str, lang: str, output_dir: Path, images: bool = False, verbose: bool = False) -> tuple[str, str]:
    logger.info(f"Processing audio from: {url}")

    # Check for required API keys
    if not os.getenv('ANTHROPIC_API_KEY'):
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    # Initialize Platogram models
    language_model = plato.llm.get_model(
        "anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY')
    )

    # Handle local file paths
    if url.startswith("file://"):
        file_path = url[7:]  # Remove "file://" prefix
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Local file not found: {file_path}")
        url = file_path  # Use the local file path directly

    # Transcribe or index content
    assemblyai_api_key = os.getenv('ASSEMBLYAI_API_KEY')
    if assemblyai_api_key:
        logger.info("Transcribing audio to text using AssemblyAI...")
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(url)
        text = transcript.text
        # Create a list of objects with a 'text' attribute
        transcript_objects = [type('obj', (), {'text': text})]
        # Now index the transcribed text
        plato.index(transcript_objects, llm=language_model, lang=lang, images=images)
    else:
        logger.warning("ASSEMBLYAI_API_KEY is not set. Retrieving text from URL (subtitles, etc).")
        plato.index(url, llm=language_model, lang=lang, images=images)

    # Generate content
    logger.info("Generating content...")
    title = plato.get_title(url, lang=lang)
    abstract = plato.get_abstract(url, lang=lang)
    passages = plato.get_passages(url, chapters=True, inline_references=True, lang=lang)
    references = plato.get_references(url, lang=lang)
    chapters = plato.get_chapters(url, lang=lang)

    contributors = plato.generate(
        query=PROMPTS[lang]["CONTRIBUTORS_PROMPT"],
        context_size="large",
        prefill=PROMPTS[lang]["CONTRIBUTORS_PREFILL"],
        url=url,
        lang=lang
    )

    introduction = plato.generate(
        query=PROMPTS[lang]["INTRODUCTION_PROMPT"],
        context_size="large",
        inline_references=True,
        prefill=PROMPTS[lang]["INTRODUCTION_PREFILL"],
        url=url,
        lang=lang
    )

    conclusion = plato.generate(
        query=PROMPTS[lang]["CONCLUSION_PROMPT"],
        context_size="large",
        inline_references=True,
        prefill=PROMPTS[lang]["CONCLUSION_PREFILL"],
        url=url,
        lang=lang
    )

    # Compile the full content
    full_content = f"""# {title}

## Origin

{url}

## Abstract

{abstract}

{contributors}

## Chapters

{chapters}

{introduction}

## Discussion

{passages}

{conclusion}

## References

{references}
"""

    # Generate PDF files
    logger.info("Generating PDF files...")
    pdf_path = output_dir / f"{title.replace(' ', '_')}-refs.pdf"
    pdf_no_refs_path = output_dir / f"{title.replace(' ', '_')}-no-refs.pdf"
    docx_path = output_dir / f"{title.replace(' ', '_')}-refs.docx"

    # Use subprocess to call pandoc for PDF and DOCX generation
    try:
        # With references
        subprocess.run(['pandoc', '-o', str(pdf_path), '--from', 'markdown', '--pdf-engine=xelatex'],
                       input=full_content, text=True, check=True)

        # Without references
        content_no_refs = remove_references(full_content)
        content_no_refs = content_no_refs.split("## References")[0]
        subprocess.run(['pandoc', '-o', str(pdf_no_refs_path), '--from', 'markdown', '--pdf-engine=xelatex'],
                       input=content_no_refs, text=True, check=True)

        # DOCX version
        subprocess.run(['pandoc', '-o', str(docx_path), '--from', 'markdown'],
                       input=full_content, text=True, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Error generating documents: {str(e)}")
        raise

    if verbose:
        print("<title>")
        print(title)
        print("</title>")
        print()
        print("<abstract>")
        print(abstract)
        print("</abstract>")

    return title, abstract

def remove_references(content):
    content = re.sub(r'\[\[([0-9]+)\]\]\([^)]+\)', '', content)
    content = re.sub(r'\[([0-9]+)\]', '', content)
    return content

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Language')
        self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.handle_status()
        elif self.path == '/reset':
            self.handle_reset()
        else:
            json_response(self, 404, {"error": "Not Found"})

    def do_POST(self):
        if self.path == '/convert':
            self.handle_convert()
        else:
            json_response(self, 404, {"error": "Not Found"})

    def get_user_email(self):
        auth_header = self.headers.get('Authorization', '')
        logger.debug(f"Authorization header: {auth_header}")
        if not auth_header:
            return None
        try:
            token = auth_header.split(' ')[1]
            return verify_token_and_get_email(token)
        except IndexError:
            logger.error("Malformed Authorization header")
            return None

    def handle_convert(self):
        logger.debug("Handling /convert request")
        content_length = int(self.headers['Content-Length'])
        content_type = self.headers.get('Content-Type')
        user_email = self.get_user_email()

        try:
            task_id = str(uuid4())
            if content_type == 'application/octet-stream':
                body = self.rfile.read(content_length)  # Read raw bytes
                file_name = self.headers.get('X-File-Name')
                lang = self.headers.get('X-Language', 'en')

                # Save the file to a temporary location
                temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file = temp_dir / f"{task_id}_{file_name}"
                with open(temp_file, 'wb') as f:
                    f.write(body)

                tasks[task_id] = {'status': 'running', 'file': str(temp_file), 'lang': lang, 'email': user_email}
                logger.debug(f"File upload received: {file_name}, Language: {lang}, Task ID: {task_id}")
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[task_id] = {'status': 'running', 'url': url, 'lang': lang, 'email': user_email}
                logger.debug(f"URL conversion request received: {url}, Language: {lang}, Task ID: {task_id}")
            else:
                logger.error(f"Invalid content type: {content_type}")
                json_response(self, 400, {"error": "Invalid content type"})
                return

            # Start processing in a separate thread
            tasks[task_id]['status'] = 'processing'
            threading.Thread(target=self.process_and_send_email, args=(task_id,)).start()

            json_response(self, 200, {"message": "Conversion started", "task_id": task_id})
        except Exception as e:
            logger.error(f"Error in handle_convert: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def process_and_send_email(self, task_id):
        try:
            task = tasks[task_id]
            user_email = task.get('email')
            logger.info(f"Starting processing for task {task_id}. User email: {user_email}")

            with tempfile.TemporaryDirectory() as tmpdir:
                output_dir = Path(tmpdir)

                # Process audio
                if 'url' in task:
                    url = task['url']
                else:
                    url = f"file://{task['file']}"

                logger.info(f"Processing URL: {url}")

                try:
                    # Call audio_to_paper function
                    logger.info("Calling audio_to_paper function...")
                    title, abstract = audio_to_paper(url, task['lang'], output_dir, images=task.get('images', False))
                    logger.info(f"audio_to_paper completed. Title: {title}")

                    files = [f for f in output_dir.glob('*') if f.is_file()]
                    logger.info(f"Generated {len(files)} files")

                    subject = f"[Platogram] {title}"
                    body = f"""Hi there!

    Platogram transformed spoken words into documents you can read and enjoy, or attach to ChatGPT/Claude/etc and prompt!

    You'll find two PDF documents attached: full version, with original transcript and references, and a simplified version, without the transcript and references. I hope this helps!

    {abstract}

    Please reply to this e-mail if any suggestions, feedback, or questions.

    ---
    Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
    Suggested donation: $2 per hour of content converted."""

                    if user_email:
                        logger.info(f"Sending email to {user_email}")
                        # Use requests instead of aiohttp for synchronous operation
                        response = requests.post(
                            "https://api.resend.com/emails",
                            headers={
                                "Authorization": f"Bearer {RESEND_API_KEY}",
                                "Content-Type": "application/json"
                            },
                            json={
                                "from": "Platogram <onboarding@resend.dev>",
                                "to": user_email,
                                "subject": subject,
                                "text": body,
                                "attachments": [
                                    {
                                        "filename": Path(f).name,
                                        "content": base64.b64encode(Path(f).read_bytes()).decode('utf-8')
                                    } for f in files
                                ]
                            }
                        )
                        if response.status_code == 200:
                            logger.info("Email sent successfully")
                        else:
                            logger.error(f"Failed to send email. Status: {response.status_code}, Error: {response.text}")
                    else:
                        logger.warning(f"No email available for task {task_id}. Skipping email send.")

                    tasks[task_id]['status'] = 'done'
                    logger.info(f"Conversion completed for task {task_id}")

                except Exception as e:
                    logger.error(f"Error in audio processing: {str(e)}", exc_info=True)
                    tasks[task_id]['status'] = 'failed'
                    tasks[task_id]['error'] = str(e)
                    raise

        except Exception as e:
            logger.error(f"Error in process_and_send_email for task {task_id}: {str(e)}", exc_info=True)
            tasks[task_id]['status'] = 'failed'
            tasks[task_id]['error'] = str(e)

    def handle_status(self):
        task_id = self.headers.get('X-Task-ID')

        if not task_id:
            # If no task ID is provided, return a general status
            json_response(self, 200, {"status": "idle"})
            return

        try:
            if task_id not in tasks:
                response = {"status": "not_found"}
            else:
                task = tasks[task_id]
                response = {
                    "status": task['status'],
                    "error": task.get('error') if task['status'] == "failed" else None
                }
            json_response(self, 200, response)
        except Exception as e:
            logger.error(f"Error in handle_status for task {task_id}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def handle_reset(self):
        task_id = self.headers.get('X-Task-ID')

        if not task_id:
            json_response(self, 400, {"error": "Task ID required"})
            return

        try:
            if task_id in tasks:
                del tasks[task_id]
            json_response(self, 200, {"message": "Task reset"})
        except Exception as e:
            logger.error(f"Error in handle_reset for task {task_id}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

# Vercel handler
def vercel_handler(event, context):
    class MockRequest:
        def __init__(self, event):
            self.headers = event['headers']
            self.method = event['httpMethod']
            self.path = event['path']
            self.body = event.get('body', '')

    class MockResponse:
        def __init__(self):
            self.status_code = 200
            self.headers = {}
            self.body = ''

        def send_response(self, status_code):
            self.status_code = status_code

        def send_header(self, key, value):
            self.headers[key] = value

        def end_headers(self):
            pass

        def wfile(self):
            class MockWFile:
                def write(self, data):
                    self.body += data.decode('utf-8') if isinstance(data, bytes) else data
            return MockWFile()

    mock_request = MockRequest(event)
    mock_response = MockResponse()

    server = handler(mock_request, mock_request.path, mock_response)

    if mock_request.method == 'GET':
        server.do_GET()
    elif mock_request.method == 'POST':
        server.do_POST()
    elif mock_request.method == 'OPTIONS':
        server.do_OPTIONS()

    return {
        'statusCode': mock_response.status_code,
        'headers': mock_response.headers,
        'body': mock_response.body,
    }