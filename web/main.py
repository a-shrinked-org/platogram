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
from http import HTTPStatus
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
        with open(attachment, "rb") as file:
            content = file.read()
            encoded_content = base64.b64encode(content).decode('utf-8')
            payload["attachments"].append({
                "filename": Path(attachment).name,
                "content": encoded_content
            })

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as response:
            if response.status == 200:
                logger.info(f"Email sent successfully to {to_email}")
            else:
                logger.error(f"Failed to send email. Status: {response.status}")
            return response

async def process_and_send_email(task_id):
    try:
        task = tasks[task_id]
        user_email = task['email']

        # Simulate processing
        await asyncio.sleep(5)  # Simulate work

        # Generate sample output files
        with tempfile.TemporaryDirectory() as tmpdir:
            sample_file = Path(tmpdir) / "sample_output.txt"
            with open(sample_file, 'w') as f:
                f.write("This is a sample output file.")

            subject = "[Platogram] Your Converted Document"
            body = """Hi there!

Platogram has transformed spoken words into documents you can read and enjoy!

Please find the converted document attached to this email.

Thank you for using Platogram!

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

            if user_email:
                await send_email_with_resend(user_email, subject, body, [sample_file])
            else:
                logger.warning(f"No email available for task {task_id}. Skipping email send.")

        tasks[task_id]['status'] = 'done'
        logger.info(f"Conversion completed for task {task_id}")
    except Exception as e:
        logger.error(f"Error in process_and_send_email for task {task_id}: {str(e)}")
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)

async def handle_convert(headers, body):
    content_type = headers.get('Content-Type')
    auth_header = headers.get('Authorization', '')
    user_email = verify_token_and_get_email(auth_header.split(' ')[1] if auth_header else None)

    task_id = str(uuid4())

    try:
        if content_type == 'application/octet-stream':
            file_name = headers.get('X-File-Name')
            lang = headers.get('X-Language', 'en')
            tasks[task_id] = {'status': 'running', 'file': file_name, 'lang': lang, 'email': user_email}
            logger.debug(f"File upload received: {file_name}, Language: {lang}, Task ID: {task_id}")
        elif content_type == 'application/json':
            data = json.loads(body)
            url = data.get('url')
            lang = data.get('lang', 'en')
            tasks[task_id] = {'status': 'running', 'url': url, 'lang': lang, 'email': user_email}
            logger.debug(f"URL conversion request received: {url}, Language: {lang}, Task ID: {task_id}")
        else:
            logger.error(f"Invalid content type: {content_type}")
            return {
                'statusCode': 400,
                'body': json.dumps({"error": "Invalid content type"})
            }

        # Start processing
        tasks[task_id]['status'] = 'processing'
        asyncio.create_task(process_and_send_email(task_id))

        return {
            'statusCode': 200,
            'body': json.dumps({"message": "Conversion started", "task_id": task_id})
        }
    except Exception as e:
        logger.error(f"Error in handle_convert: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }

def handle_status(headers):
    task_id = headers.get('X-Task-ID')

    if not task_id:
        return {
            'statusCode': 200,
            'body': json.dumps({"status": "idle"})
        }

    try:
        if task_id not in tasks:
            response = {"status": "not_found"}
        else:
            task = tasks[task_id]
            response = {
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }
        return {
            'statusCode': 200,
            'body': json.dumps(response)
        }
    except Exception as e:
        logger.error(f"Error in handle_status for task {task_id}: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }

def handle_reset(headers):
    task_id = headers.get('X-Task-ID')

    if not task_id:
        return {
            'statusCode': 400,
            'body': json.dumps({"error": "Task ID required"})
        }

    try:
        if task_id in tasks:
            del tasks[task_id]
        return {
            'statusCode': 200,
            'body': json.dumps({"message": "Task reset"})
        }
    except Exception as e:
        logger.error(f"Error in handle_reset for task {task_id}: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }

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
        return await handle_convert(headers, body)

    if method == 'GET' and path == '/status':
        return handle_status(headers)

    if method == 'GET' and path == '/reset':
        return handle_reset(headers)

    return {
        'statusCode': 404,
        'body': json.dumps({"error": "Not Found"}),
    }

def handler(event, context):
    return asyncio.run(handle_request(event, context))