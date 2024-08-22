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
import stripe
import logfire
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from uuid import uuid4
from vercel_kv import VercelKV
import io
import subprocess
import asyncio
import aiofiles
import aiofiles.tempfile


import platogram as plato
from anthropic import AnthropicError
import assemblyai as aai

import nltk
from nltk.tokenize import sent_tokenize

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configure Stripe
stripe.api_key = os.getenv("STRIPE_API_KEY")

# Configure logfire
logfire.configure()

kv = VercelKV(os.environ["KV_REST_API_URL"], os.environ["KV_REST_API_TOKEN"])

async def create_task(task_id, task_data):
    await kv.set(f"task:{task_id}", json.dumps(task_data))

    async def get_task_status(task_id):
        task_data = await kv.get(f"task:{task_id}")
        if task_data:
            return json.loads(task_data)
        return None



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
    if os.getenv('ASSEMBLYAI_API_KEY'):
        logger.info("Transcribing audio to text using AssemblyAI...")
        await plato.index(url, llm=language_model, assemblyai_api_key=os.getenv('ASSEMBLYAI_API_KEY'), lang=lang)
    else:
        logger.warning("ASSEMBLYAI_API_KEY is not set. Retrieving text from URL (subtitles, etc).")
        await plato.index(url, llm=language_model, lang=lang)

    # Generate content
    logger.info("Generating content...")
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

    contributors = plato.generate(
        query=CONTRIBUTORS_PROMPT,
        context_size="large",
        prefill=f"## Contributors, Acknowledgements, Mentions\n",
        url=url,
        lang=lang
    )

    introduction = plato.generate(
        query=INTRODUCTION_PROMPT,
        context_size="large",
        inline_references=True,
        prefill=f"## Introduction\n",
        url=url,
        lang=lang
    )

    conclusion = plato.generate(
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

    return title, abstract

import asyncio
import aiofiles
import aiofiles.tempfile

# ... (other imports remain the same)

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Language, X-Price, X-Token')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/task_status'):
            self.handle_task_status()
        elif self.path == '/status':
            self.handle_status()
        elif self.path == '/reset':
            self.handle_reset()
        else:
            json_response(self, 404, {"error": "Not Found"})

    def handle_task_status(self):
        task_id = self.path.split('/')[-1]
        task_data = asyncio.run(get_task_status(task_id))
        if task_data:
            response = {
                "task_id": task_id,
                "status": task_data['status'],
                "error": task_data.get('error') if task_data['status'] == "failed" else None
            }
            json_response(self, 200, response)
        else:
            json_response(self, 404, {"error": "Task not found"})

    def do_POST(self):
        if self.path == '/convert':
            asyncio.run(self.handle_convert())
        else:
            json_response(self, 404, {"error": "Not Found"})

    async def handle_convert(self):
    logfire.info("Handling /convert request")
    content_length = int(self.headers['Content-Length'])
    content_type = self.headers.get('Content-Type')
    user_email = self.get_user_email()
    logfire.info(f"User email for conversion: {user_email}")

    try:
        task_id = str(uuid4())
        if content_type == 'application/octet-stream':
            body = self.rfile.read(content_length)  # Read raw bytes
            file_name = self.headers.get('X-File-Name')
            lang = self.headers.get('X-Language', 'en')
            price = float(self.headers.get('X-Price', 0))
            token = self.headers.get('X-Token')

            # Save the file to a temporary location
            temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file = temp_dir / f"{task_id}_{file_name}"
            with open(temp_file, 'wb') as f:
                f.write(body)

            task_data = {'status': 'processing', 'file': str(temp_file), 'lang': lang, 'email': user_email, 'price': price, 'token': token}
            logfire.info(f"File upload received: {file_name}, Language: {lang}, Task ID: {task_id}, User Email: {user_email}")
        elif content_type == 'application/json':
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            url = data.get('url')
            lang = data.get('lang', 'en')
            price = float(data.get('price', 0))
            token = data.get('token')
            task_data = {'status': 'processing', 'url': url, 'lang': lang, 'email': user_email, 'price': price, 'token': token}
            logfire.info(f"URL conversion request received: {url}, Language: {lang}, Task ID: {task_id}, User Email: {user_email}")
        else:
            logfire.error(f"Invalid content type: {content_type}")
            json_response(self, 400, {"error": "Invalid content type"})
            return

        # Save task data to Vercel KV
        await create_task(task_id, task_data)
        # Add task to processing queue
        await kv.rpush("task_queue", task_id)

        json_response(self, 200, {"message": "Conversion started", "task_id": task_id})
    except Exception as e:
        logfire.exception(f"Error in handle_convert: {str(e)}")
        json_response(self, 500, {"error": "An unexpected error occurred. Please try again later."})

async def process_tasks():
    while True:
        task_id = await kv.lpop("task_queue")
        if not task_id:
            break

        task_data = await get_task_status(task_id)
        if task_data and task_data['status'] == 'processing':
            try:
                # Process the task
                await process_and_send_email(task_id, task_data)

                # Update task status
                task_data['status'] = 'done'
                await create_task(task_id, task_data)
            except Exception as e:
                logfire.exception(f"Error processing task {task_id}: {str(e)}")
                task_data['status'] = 'failed'
                task_data['error'] = str(e)
                await create_task(task_id, task_data)

# Modifing process_and_send_email to accept task_data
async def process_and_send_email(task_id, task_data):
        try:
            task = task_data
            user_email = task.get('email')
            logfire.info(f"Starting processing for task {task_id}. User email: {user_email}")

            async with aiofiles.tempfile.TemporaryDirectory() as tmpdir:
                output_dir = Path(tmpdir)

                # Process audio
                if 'url' in task:
                    url = task['url']
                else:
                    url = f"file://{task['file']}"

                logfire.info(f"Processing URL: {url}")

                try:
                    # Initialize the language model
                    language_model = plato.llm.get_model(
                        "anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY')
                    )
                    logfire.info("Language model initialized")

                    # Set AssemblyAI API key in the environment if available
                    if os.getenv('ASSEMBLYAI_API_KEY'):
                        logfire.info("Transcribing audio to text using AssemblyAI...")
                        os.environ['ASSEMBLYAI_API_KEY'] = os.getenv('ASSEMBLYAI_API_KEY')
                    else:
                        logfire.warning("ASSEMBLYAI_API_KEY is not set. Retrieving text from URL (subtitles, etc).")

                    # Call plato.index() with error handling
                    try:
                        logfire.info("Calling plato.index()...")
                        await plato.index(url, llm=language_model, lang=task['lang'])
                        logfire.info("plato.index() completed successfully")
                    except AttributeError as e:
                        if "'str' object has no attribute 'text'" in str(e):
                            logfire.warning("Received string input instead of transcript objects. Attempting to process as string.")
                            words = url.split()  # Simple word splitting
                            transcript_objects = [type('obj', (), {'text': w})() for w in words]
                            await plato.index(transcript_objects, llm=language_model, lang=task['lang'])
                            logfire.info("Processed string input successfully")
                        else:
                            raise

                    # Call audio_to_paper function
                    logfire.info("Calling audio_to_paper function...")
                    title, abstract = await audio_to_paper(url, task['lang'], output_dir, images=task.get('images', False))
                    logfire.info(f"audio_to_paper completed. Title: {title}")

                    files = [f for f in output_dir.glob('*') if f.is_file()]
                    logfire.info(f"Generated {len(files)} files")

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
                        logfire.info(f"Sending email to {user_email}")
                        await send_email_with_resend(user_email, subject, body, files)
                        logfire.info("Email sent successfully")
                    else:
                        logfire.warning(f"No email available for task {task_id}. Skipping email send.")

                    task_data['status'] = 'done'
                    logfire.info(f"Conversion completed for task {task_id}")

                    # Process payment
                    if task['price'] > 0 and task['token']:
                        try:
                            charge = stripe.Charge.create(
                                amount=int(task['price'] * 100),
                                currency='usd',
                                source=task['token'],
                                description=f'Platogram conversion: {title}'
                            )
                            logfire.info(f"Payment processed successfully for task {task_id}", charge_id=charge.id)
                        except stripe.error.StripeError as e:
                            logfire.error(f"Stripe payment failed for task {task_id}: {str(e)}")
                            task_data['error'] = "Payment processing failed. Please contact support."
                    else:
                        logfire.info(f"No charge for task {task_id}")

                except Exception as e:
                    logfire.exception(f"Error in audio processing: {str(e)}")
                    task_data['status'] = 'failed'
                    task_data['error'] = self.get_user_friendly_error_message(str(e))
                    raise

        except Exception as e:
            logfire.exception(f"Error in process_and_send_email for task {task_id}: {str(e)}")
            task_data['status'] = 'failed'
            task_data['error'] = self.get_user_friendly_error_message(str(e))

    def get_user_friendly_error_message(self, error_message):
        # Use a language model to generate a user-friendly error message
        model = plato.llm.get_model("anthropic/claude-3-5-sonnet", key=os.getenv("ANTHROPIC_API_KEY"))
        prompt = f"""
        Given the following error message, provide a concise, user-friendly explanation
        that focuses on the key issue and any actionable steps. Avoid technical jargon
        and keep the message under 256 characters:

        Error: {error_message}
        """
        response = model.prompt_model(messages=[plato.types.User(content=prompt)])
        return response.strip()[:256]  # Truncate to 256 characters

    def get_user_email(self):
        auth_header = self.headers.get('Authorization', '')
        logfire.debug(f"Authorization header: {auth_header}")
        if not auth_header:
            logfire.warning("No Authorization header found")
            return None
        try:
            token = auth_header.split(' ')[1]
            email = verify_token_and_get_email(token)
            logfire.debug(f"User email extracted: {email}")
            return email
        except IndexError:
            logfire.error("Malformed Authorization header")
            return None

    def handle_status(self):
        task_id = self.headers.get('X-Task-ID')
        if not task_id:
            json_response(self, 200, {"status": "idle"})
            return

        try:
            if task_id not in tasks:
                response = {"status": "not_found"}
            else:
                task = task_data
                response = {
                    "status": task['status'],
                    "error": task.get('error') if task['status'] == "failed" else None
                }
            json_response(self, 200, response)
        except Exception as e:
            logfire.exception(f"Error in handle_status for task {task_id}: {str(e)}")
            json_response(self, 500, {"error": "An unexpected error occurred while checking status."})

    def handle_reset(self):
        user_email = self.get_user_email()
        if not user_email:
            json_response(self, 401, {"error": "Unauthorized"})
            return

        try:
            task_ids_to_remove = []
            for task_id, task in tasks.items():
                if task.get('email') == user_email:
                    task_ids_to_remove.append(task_id)

            for task_id in task_ids_to_remove:
                del task_data

            logfire.info(f"Reset tasks for user: {user_email}")
            json_response(self, 200, {"message": "Tasks reset successfully"})
        except Exception as e:
            logfire.exception(f"Error in handle_reset for user {user_email}: {str(e)}")
            json_response(self, 500, {"error": "An unexpected error occurred while resetting tasks."})

# Vercel handler
def vercel_handler(event, context):
    async def async_handler(event, context):
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
            await server.do_POST()
        elif mock_request.method == 'OPTIONS':
            server.do_OPTIONS()

        return {
            'statusCode': mock_response.status_code,
            'headers': mock_response.headers,
            'body': mock_response.body,
        }

    loop = asyncio.get_event_loop()
    return loop.run_until_complete(async_handler(event, context))