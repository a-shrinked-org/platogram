import json
import os
import logging
import tempfile
from pathlib import Path
import base64
import time
import requests
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from uuid import uuid4
import asyncio
import aiofiles
import aiohttp
import re
import subprocess

import platogram as plato
import assemblyai as aai

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

# Load environment variables
RESEND_API_KEY = os.getenv('RESEND_API_KEY')
AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN')
API_AUDIENCE = os.getenv('API_AUDIENCE')
ALGORITHMS = ["RS256"]
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

# Configure AssemblyAI
aai.settings.api_key = os.getenv('ASSEMBLYAI_API_KEY')

# Auth0 public key cache
auth0_public_key_cache = {"key": None, "last_updated": 0, "expires_in": 3600}

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
    logger.info("Starting audio to paper conversion", extra={"url": url, "lang": lang})

    if not os.getenv('ANTHROPIC_API_KEY'):
        logger.error("ANTHROPIC_API_KEY not set")
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    language_model = plato.llm.get_model(
        "anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY')
    )
    logger.info("Language model initialized")

    if url.startswith("file://"):
        file_path = url[7:]
        if not os.path.exists(file_path):
            logger.error("Local file not found", extra={"file_path": file_path})
            raise FileNotFoundError(f"Local file not found: {file_path}")
        url = file_path

    if os.getenv('ASSEMBLYAI_API_KEY'):
        logger.info("Transcribing audio using AssemblyAI")
        await plato.index(url, llm=language_model, assemblyai_api_key=os.getenv('ASSEMBLYAI_API_KEY'), lang=lang)
    else:
        logger.warning("ASSEMBLYAI_API_KEY not set, retrieving text from URL")
        await plato.index(url, llm=language_model, lang=lang)

    logger.info("Generating content")
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

    logger.info("PDF files generated", extra={"title": title})
    return title, abstract

async def process_and_send_email(task_id):
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

async def handle_request(event, context):
    method = event['httpMethod']
    path = event['path']
    headers = event['headers']
    body = event.get('body', '')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-Language',
            },
        }

    if method == 'POST' and path == '/convert':
        content_type = headers.get('Content-Type')
        auth_header = headers.get('Authorization', '')
        user_email = verify_token_and_get_email(auth_header.split(' ')[1] if auth_header else None)

        task_id = str(uuid4())

        if content_type == 'application/octet-stream':
            file_name = headers.get('X-File-Name')
            lang = headers.get('X-Language', 'en')

            temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file = temp_dir / f"{task_id}_{file_name}"
            with open(temp_file, 'wb') as f:
                f.write(body.encode('utf-8') if isinstance(body, str) else body)
            url = f"file://{temp_file}"
        elif content_type == 'application/json':
            data = json.loads(body)
            url = data.get('url')
            lang = data.get('lang', 'en')
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({"error": "Invalid content type"}),
            }

        tasks[task_id] = {'status': 'processing', 'url': url, 'lang': lang, 'email': user_email}
        asyncio.create_task(process_and_send_email(task_id))

        return {
            'statusCode': 200,
            'body': json.dumps({"message": "Conversion started", "task_id": task_id}),
        }

    if method == 'GET' and path.startswith('/task_status/'):
        task_id = path.split('/')[-1]
        if task_id in tasks:
            task = tasks[task_id]
            response = {
                "task_id": task_id,
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }
            return {
                'statusCode': 200,
                'body': json.dumps(response),
            }
        else:
            return {
                'statusCode': 404,
                'body': json.dumps({"error": "Task not found"}),
            }

    return {
        'statusCode': 404,
        'body': json.dumps({"error": "Not Found"}),
    }

def handler(event, context):
    return asyncio.run(handle_request(event, context))