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
import asyncpg
import asyncio
import aiofiles
import aiofiles.tempfile
import aiohttp

import platogram as plato
from anthropic import AnthropicError
import assemblyai as aai

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configure Stripe
stripe.api_key = os.getenv("STRIPE_API_KEY")

# Configure logfire
logfire.configure()

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

db_pool = None

async def get_db_pool():
    global db_pool
    if db_pool is None:
        db_pool = await asyncpg.create_pool(os.environ['POSTGRES_URL'])
    return db_pool

async def create_task(pool, task_id, task_data):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO tasks (id, data) VALUES ($1, $2)",
            task_id, json.dumps(task_data)
        )

async def get_task_status(pool, task_id):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT data FROM tasks WHERE id = $1",
            task_id
        )
        return json.loads(row['data']) if row else None

async def update_task_status(pool, task_id, task_data):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE tasks SET data = $1 WHERE id = $2",
            json.dumps(task_data), task_id
        )
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

    if not os.getenv('ANTHROPIC_API_KEY'):
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    language_model = plato.llm.get_model(
        "anthropic/claude-3-5-sonnet", os.getenv('ANTHROPIC_API_KEY')
    )

    if url.startswith("file://"):
        file_path = url[7:]
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Local file not found: {file_path}")
        url = file_path

    if os.getenv('ASSEMBLYAI_API_KEY'):
        logger.info("Transcribing audio to text using AssemblyAI...")
        await plato.index(url, llm=language_model, assemblyai_api_key=os.getenv('ASSEMBLYAI_API_KEY'), lang=lang)
    else:
        logger.warning("ASSEMBLYAI_API_KEY is not set. Retrieving text from URL (subtitles, etc).")
        await plato.index(url, llm=language_model, lang=lang)

    logger.info("Generating content...")
    title = await plato.get_title(url, lang=lang)
    abstract = await plato.get_abstract(url, lang=lang)
    passages = await plato.get_passages(url, chapters=True, inline_references=True, lang=lang)
    references = await plato.get_references(url, lang=lang)
    chapters = await plato.get_chapters(url, lang=lang)

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

    logger.info("Generating PDF files...")
    pdf_path = output_dir / f"{title.replace(' ', '_')}-refs.pdf"
    pdf_no_refs_path = output_dir / f"{title.replace(' ', '_')}-no-refs.pdf"
    docx_path = output_dir / f"{title.replace(' ', '_')}-refs.docx"

    try:
        process = await asyncio.create_subprocess_exec(
            'pandoc', '-o', str(pdf_path), '--from', 'markdown', '--pdf-engine=xelatex',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate(full_content.encode())
        if process.returncode != 0:
            logger.error(f"Error generating PDF: {stderr.decode()}")
            raise RuntimeError(f"PDF generation failed with return code {process.returncode}")

        content_no_refs = re.sub(r'\[\[([0-9]+)\]\]\([^)]+\)', '', full_content)
        content_no_refs = re.sub(r'\[([0-9]+)\]', '', content_no_refs)
        content_no_refs = content_no_refs.split("## References")[0]

        process = await asyncio.create_subprocess_exec(
            'pandoc', '-o', str(pdf_no_refs_path), '--from', 'markdown', '--pdf-engine=xelatex',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate(content_no_refs.encode())
        if process.returncode != 0:
            logger.error(f"Error generating PDF without references: {stderr.decode()}")
            raise RuntimeError(f"PDF generation (no refs) failed with return code {process.returncode}")

        process = await asyncio.create_subprocess_exec(
            'pandoc', '-o', str(docx_path), '--from', 'markdown',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate(full_content.encode())
        if process.returncode != 0:
            logger.error(f"Error generating DOCX: {stderr.decode()}")
            raise RuntimeError(f"DOCX generation failed with return code {process.returncode}")

    except Exception as e:
        logger.error(f"Error generating documents: {str(e)}")
        raise

    return title, abstract

async def process_and_send_email(pool, task_id, task_data):
    try:
        user_email = task_data.get('email')
        logfire.info(f"Starting processing for task {task_id}. User email: {user_email}")

        async with aiofiles.tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)

            url = task_data.get('url') or f"file://{task_data['file']}"
            logfire.info(f"Processing URL: {url}")

            title, abstract = await audio_to_paper(url, task_data['lang'], output_dir, images=task_data.get('images', False))
            logfire.info(f"Audio to paper completed. Title: {title}")

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

            if task_data['price'] > 0 and task_data['token']:
                try:
                    charge = stripe.Charge.create(
                        amount=int(task_data['price'] * 100),
                        currency='usd',
                        source=task_data['token'],
                        description=f'Platogram conversion: {title}'
                    )
                    logfire.info(f"Payment processed successfully for task {task_id}", charge_id=charge.id)
                except stripe.error.StripeError as e:
                    logfire.error(f"Stripe payment failed for task {task_id}: {str(e)}")
                    task_data['error'] = "Payment processing failed. Please contact support."
            else:
                logfire.info(f"No charge for task {task_id}")

            await update_task_status(pool, task_id, task_data)

    except Exception as e:
        logfire.exception(f"Error in process_and_send_email for task {task_id}: {str(e)}")
        task_data['status'] = 'failed'
        task_data['error'] = await get_user_friendly_error_message(str(e))
        await update_task_status(pool, task_id, task_data)

async def handle_task_status(task_id):
    pool = await get_db_pool()
    task_data = await get_task_status(pool, task_id)
    if task_data:
        response = {
            "task_id": task_id,
            "status": task_data['status'],
            "error": task_data.get('error') if task_data['status'] == "failed" else None
        }
        return {'statusCode': 200, 'body': json.dumps(response)}
    else:
        return {'statusCode': 404, 'body': json.dumps({"error": "Task not found"})}

async def handle_status(headers):
    task_id = headers.get('X-Task-ID')
    logger.info(f"Handling status request for task_id: {task_id}")

    if not task_id:
        logger.info("No task_id provided, returning idle status")
        return {'statusCode': 200, 'body': json.dumps({"status": "idle"})}

    pool = await get_db_pool()
    try:
        task_data = await get_task_status(pool, task_id)
        if not task_data:
            logger.info(f"No task found for task_id: {task_id}")
            response = {"status": "not_found"}
        else:
            logger.info(f"Task status for {task_id}: {task_data['status']}")
            response = {
                "status": task_data['status'],
                "error": task_data.get('error') if task_data['status'] == "failed" else None
            }
        return {'statusCode': 200, 'body': json.dumps(response)}
    except Exception as e:
        logger.exception(f"Error in handle_status for task {task_id}: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({"error": "An unexpected error occurred while checking status."})}

async def handle_reset(headers):
    user_email = verify_token_and_get_email(headers.get('Authorization', '').split(' ')[1])
    if not user_email:
        return {'statusCode': 401, 'body': json.dumps({"error": "Unauthorized"})}

    pool = await get_db_pool()
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM tasks WHERE data->>'email' = $1",
                user_email
            )
        logfire.info(f"Reset tasks for user: {user_email}")
        return {'statusCode': 200, 'body': json.dumps({"message": "Tasks reset successfully"})}
    except Exception as e:
        logfire.exception(f"Error in handle_reset for user {user_email}: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({"error": "An unexpected error occurred while resetting tasks."})}

async def handle_convert(headers, body):
    user_email = verify_token_and_get_email(headers.get('Authorization', '').split(' ')[1])
    if not user_email:
        return {'statusCode': 401, 'body': json.dumps({"error": "Unauthorized"})}

    pool = await get_db_pool()
    try:
        task_id = str(uuid4())
        data = json.loads(body)
        task_data = {
            'status': 'processing',
            'url': data.get('url'),
            'lang': data.get('lang', 'en'),
            'email': user_email,
            'price': float(data.get('price', 0)),
            'token': data.get('token')
        }
        await create_task(pool, task_id, task_data)
        # Instead of running the task immediately, we'll let the cron job handle it
        return {'statusCode': 200, 'body': json.dumps({"message": "Conversion queued", "task_id": task_id})}
    except Exception as e:
        logfire.exception(f"Error in handle_convert: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({"error": "An unexpected error occurred. Please try again later."})}

async def handle_cron(event, context):
    pool = await get_db_pool()
    try:
        async with pool.acquire() as conn:
            tasks = await conn.fetch(
                "SELECT id, data FROM tasks WHERE data->>'status' = 'processing'"
            )

        for task in tasks:
            task_id = task['id']
            task_data = json.loads(task['data'])
            asyncio.create_task(process_and_send_email(pool, task_id, task_data))

        return {'statusCode': 200, 'body': json.dumps({"message": "Cron job executed successfully"})}
    except Exception as e:
        logfire.exception(f"Error in cron job: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({"error": "An error occurred during the cron job execution"})}

async def handle_request(event, context):
    logger.info(f"Received request: {event}")
    pool = await get_db_pool()

    path = event['path']
    method = event['httpMethod']
    headers = event.get('headers', {})
    body = event.get('body', '')

    logger.info(f"Processing {method} request to {path}")

    if method == 'GET':
        if path.startswith('/task_status/'):
            logger.info("Handling /status request")
            task_id = path.split('/')[-1]
            return await handle_task_status(task_id)
        elif path == '/status':
            return await handle_status(headers)
        elif path == '/reset':
            return await handle_reset(headers)
        elif path == '/api/cron':
            return await handle_cron(event, context)
        else:
            return {'statusCode': 404, 'body': json.dumps({"error": "Not Found"})}
    elif method == 'POST':
        if path == '/convert':
            return await handle_convert(headers, body)
        else:
            return {'statusCode': 404, 'body': json.dumps({"error": "Not Found"})}
    elif method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-Language, X-Price, X-Token'
            },
            'body': ''
        }
    else:
        return {'statusCode': 405, 'body': json.dumps({"error": "Method Not Allowed"})}

def handler(event, context):
    return asyncio.get_event_loop().run_until_complete(handle_request(event, context))

# This is the entry point for Vercel
def vercel_handler(request):
    # Convert the Vercel request to the format expected by your handler
    event = {
        'httpMethod': request.method,
        'path': request.url.path,
        'headers': dict(request.headers),
        'body': request.body.decode() if request.body else ''
    }

    result = handler(event, {})

    # Convert the result back to what Vercel expects
    return {
        'statusCode': result['statusCode'],
        'headers': result.get('headers', {}),
        'body': result['body']
    }