from http.server import BaseHTTPRequestHandler
import json
import os
import logging
import re
import tempfile
from pathlib import Path
import base64
import time
import requests
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from uuid import uuid4
import subprocess
import asyncio
import aiofiles
import aiofiles.tempfile
import aiohttp
import logfire
import io

import platogram as plato
from anthropic import AnthropicError
import assemblyai as aai

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configure logfire
logfire.configure()

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

async def audio_to_paper(url: str, lang: str, output_dir: Path, images: bool = False) -> tuple[str, str]:
    logfire.info("Starting audio to paper conversion", extra={"url": url, "lang": lang})

    if not os.getenv('ANTHROPIC_API_KEY'):
        logfire.error("ANTHROPIC_API_KEY not set")
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    language_model = plato.llm.get_model(
        "anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY')
    )
    logfire.info("Language model initialized")

    if url.startswith("file://"):
        file_path = url[7:]
        if not os.path.exists(file_path):
            logfire.error("Local file not found", extra={"file_path": file_path})
            raise FileNotFoundError(f"Local file not found: {file_path}")
        url = file_path

    if os.getenv('ASSEMBLYAI_API_KEY'):
        logfire.info("Transcribing audio using AssemblyAI")
        await plato.index(url, llm=language_model, assemblyai_api_key=os.getenv('ASSEMBLYAI_API_KEY'), lang=lang)
    else:
        logfire.warning("ASSEMBLYAI_API_KEY not set, retrieving text from URL")
        await plato.index(url, llm=language_model, lang=lang)

    logfire.info("Generating content")
    title = await plato.get_title(url, lang=lang)
    abstract = await plato.get_abstract(url, lang=lang)
    passages = await plato.get_passages(url, chapters=True, inline_references=True, lang=lang)
    references = await plato.get_references(url, lang=lang)
    chapters = await plato.get_chapters(url, lang=lang)

    # Set language-specific prompts
    if lang == "en":
        CONTRIBUTORS_PROMPT = "Thoroughly review the <context> and identify the list of contributors. Output as Markdown list: First Name, Last Name, Title, Organization. Output \"Unknown\" if the contributors are not known. In the end of the list always add \"- [Platogram](https://github.com/code-anyway/platogram), Chief of Stuff, Code Anyway, Inc.\". Start with \"## Contributors, Acknowledgements, Mentions\""
        INTRODUCTION_PROMPT = "Thoroughly review the <context> and write \"Introduction\" chapter for the paper. Write in the style of the original <context>. Use only words from <context>. Use quotes from <context> when necessary. Make sure to include <markers>. Output as Markdown. Start with \"## Introduction\""
        CONCLUSION_PROMPT = "Thoroughly review the <context> and write \"Conclusion\" chapter for the paper. Write in the style of the original <context>. Use only words from <context>. Use quotes from <context> when necessary. Make sure to include <markers>. Output as Markdown. Start with \"## Conclusion\""
    elif lang == "es":
        CONTRIBUTORS_PROMPT = "Revise a fondo el <context> e identifique la lista de contribuyentes. Salida como lista Markdown: Nombre, Apellido, Título, Organización. Salida \"Desconocido\" si los contribuyentes no se conocen. Al final de la lista, agregue siempre \"- [Platogram](https://github.com/code-anyway/platogram), Chief of Stuff, Code Anyway, Inc.\". Comience con \"## Contribuyentes, Agradecimientos, Menciones\""
        INTRODUCTION_PROMPT = "Revise a fondo el <context> y escriba el capítulo \"Introducción\" para el artículo. Escriba en el estilo del original <context>. Use solo las palabras de <context>. Use comillas del original <context> cuando sea necesario. Asegúrese de incluir <markers>. Salida como Markdown. Comience con \"## Introducción\""
        CONCLUSION_PROMPT = "Revise a fondo el <context> y escriba el capítulo \"Conclusión\" para el artículo. Escriba en el estilo del original <context>. Use solo las palabras de <context>. Use comillas del original <context> cuando sea necesario. Asegúrese de incluir <markers>. Salida como Markdown. Comience con \"## Conclusión\""
    else:
        raise ValueError(f"Unsupported language: {lang}")

    contributors = await plato.generate(
        query=CONTRIBUTORS_PROMPT,
        context_size="large",
        prefill=f"## Contributors, Acknowledgements, Mentions\n",
        url=url,
        lang=lang
    )

    introduction = await plato.generate(
        query=INTRODUCTION_PROMPT,
        context_size="large",
        inline_references=True,
        prefill=f"## Introduction\n",
        url=url,
        lang=lang
    )

    conclusion = await plato.generate(
        query=CONCLUSION_PROMPT,
        context_size="large",
        inline_references=True,
        prefill=f"## Conclusion\n",
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
        content_no_refs = re.sub(r'\[\[([0-9]+)\]\]\([^)]+\)', '', full_content)
        content_no_refs = re.sub(r'\[([0-9]+)\]', '', content_no_refs)
        content_no_refs = content_no_refs.split("## References")[0]
        subprocess.run(['pandoc', '-o', str(pdf_no_refs_path), '--from', 'markdown', '--pdf-engine=xelatex'],
                       input=content_no_refs, text=True, check=True)

        # DOCX version
        subprocess.run(['pandoc', '-o', str(docx_path), '--from', 'markdown'],
                       input=full_content, text=True, check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Error generating documents: {str(e)}")
        raise

    logfire.info("PDF files generated", extra={"title": title})
    return title, abstract

class LambdaHandler:
    def __init__(self, event):
        self.event = event
        self.method = event['httpMethod']
        self.path = event['path']
        self.headers = {k.lower(): v for k, v in event['headers'].items()}
        self.body = event.get('body', '')
        self.response = {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-Language'
            },
            'body': ''
        }

    def send_response(self, status_code, data):
        self.response['statusCode'] = status_code
        self.response['body'] = json.dumps(data)

    async def handle_request(self):
        if self.method == 'OPTIONS':
            return self.response
        elif self.method == 'GET':
            if self.path.startswith('/task_status'):
                await self.handle_task_status()
            elif self.path == '/status':
                await self.handle_status()
            elif self.path == '/reset':
                await self.handle_reset()
            else:
                self.send_response(404, {"error": "Not Found"})
        elif self.method == 'POST':
            if self.path == '/convert':
                await self.handle_convert()
            else:
                self.send_response(404, {"error": "Not Found"})
        else:
            self.send_response(405, {"error": "Method Not Allowed"})

        return self.response

    async def handle_task_status(self):
        task_id = self.path.split('/')[-1]
        if task_id in tasks:
            task = tasks[task_id]
            response = {
                "task_id": task_id,
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }
            self.send_response(200, response)
        else:
            self.send_response(404, {"error": "Task not found"})

    async def handle_convert(self):
        logger.debug("Handling /convert request")
        content_type = self.headers.get('content-type')
        user_email = await self.get_user_email()
        logfire.info("Conversion request received",
                     extra={"user_email": user_email, "content_type": content_type})
        
        try:
            task_id = str(uuid4())
            if content_type == 'application/octet-stream':
                body = self.body.encode() if isinstance(self.body, str) else self.body
                file_name = self.headers.get('x-file-name')
                lang = self.headers.get('x-language', 'en')

                temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file = temp_dir / f"{task_id}_{file_name}"
                with open(temp_file, 'wb') as f:
                    f.write(body)

                tasks[task_id] = {'status': 'running', 'file': str(temp_file), 'lang': lang, 'email': user_email}
                logfire.info("File upload received",
                             extra={"file_name": file_name, "lang": lang, "task_id": task_id, "user_email": user_email})
            elif content_type == 'application/json':
                data = json.loads(self.body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[task_id] = {'status': 'running', 'url': url, 'lang': lang, 'email': user_email}
                logfire.info("URL conversion request received",
                             extra={"url": url, "lang": lang, "task_id": task_id, "user_email": user_email})
            else:
                logfire.error("Invalid content type", extra={"content_type": content_type})
                self.send_response(400, {"error": "Invalid content type"})
                return

            tasks[task_id]['status'] = 'processing'
            asyncio.create_task(self.process_and_send_email(task_id))

            self.send_response(200, {"message": "Conversion started", "task_id": task_id})
        except Exception as e:
            logfire.exception("Error in handle_convert", extra={"error": str(e)})
            self.send_response(500, {"error": str(e)})

    async def process_and_send_email(self, task_id):
        try:
            task = tasks[task_id]
            user_email = task.get('email')
            logger.info(f"Starting processing for task {task_id}. User email: {user_email}")

            async with aiofiles.tempfile.TemporaryDirectory() as tmpdir:
                output_dir = Path(tmpdir)

                if 'url' in task:
                    url = task['url']
                else:
                    url = f"file://{task['file']}"

                logger.info(f"Processing URL: {url}")

                try:
                    title, abstract = await audio_to_paper(url, task['lang'], output_dir, images=task.get('images', False))
                    logger.info(f"audio_to_paper completed. Title: {title}")

                    files = [f for f in output_dir.glob('*') if f.is_file()]
                    logger.info(f"Generated {len(files)} files: {[f.name for f in files]}")

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
                        logger.info(f"Attempting to send email to {user_email}")
                        email_response = await send_email_with_resend(user_email, subject, body, files)
                        logger.info(f"Email sent. Response status: {email_response.status}")
                        logger.debug(f"Email response body: {await email_response.text()}")
                    else:
                        logger.warning(f"No email available for task {task_id}. Skipping email send.")

                    tasks[task_id]['status'] = 'done'
                    logger.info(f"Conversion completed for task {task_id}")

                except Exception as e:
                    logger.error(f"Error in audio processing for task {task_id}: {str(e)}", exc_info=True)
                    tasks[task_id]['status'] = 'failed'
                    tasks[task_id]['error'] = str(e)
                    raise

        except Exception as e:
            logger.error(f"Error in process_and_send_email for task {task_id}: {str(e)}", exc_info=True)
            tasks[task_id]['status'] = 'failed'
            tasks[task_id]['error'] = str(e)

   async def get_user_email(self):
        auth_header = self.headers.get('authorization', '')
        logger.debug(f"Authorization header: {auth_header}")
        if not auth_header:
            logger.warning("No Authorization header found")
            return None
        try:
            token = auth_header.split(' ')[1]
            email = verify_token_and_get_email(token)
            logger.debug(f"User email extracted: {email}")
            return email
        except IndexError:
            logger.error("Malformed Authorization header")
            return None

    async def handle_status(self):
        task_id = self.headers.get('x-task-id')
        if not task_id:
            self.send_response(200, {"status": "idle"})
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
            self.send_response(200, response)
        except Exception as e:
            logger.error(f"Error in handle_status for task {task_id}: {str(e)}")
            self.send_response(500, {"error": str(e)})

    async def handle_reset(self):
        user_email = await self.get_user_email()
        logger.info(f"Handling reset request for user: {user_email}")

        if not user_email:
            logger.warning("Reset attempt without valid user email")
            self.send_response(401, {"error": "Unauthorized"})
            return

        try:
            tasks_to_remove = [task_id for task_id, task in tasks.items() if task.get('email') == user_email]
            for task_id in tasks_to_remove:
                logger.info(f"Removing task {task_id} for user {user_email}")
                del tasks[task_id]

            logger.info(f"Reset {len(tasks_to_remove)} tasks for user {user_email}")
            self.send_response(200, {"message": f"Reset {len(tasks_to_remove)} tasks for user"})
        except Exception as e:
            logger.error(f"Error in handle_reset for user {user_email}: {str(e)}", exc_info=True)
            self.send_response(500, {"error": f"An error occurred while resetting tasks: {str(e)}"})

async def handler(event, context):
    lambda_handler = LambdaHandler(event)
    return await lambda_handler.handle_request()

def entrypoint(event, context):
    return asyncio.run(handler(event, context))