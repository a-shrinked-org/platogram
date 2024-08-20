import os
import json
import asyncio
import tempfile
import logfire
import time
from pathlib import Path
from typing import Dict, Any
import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate

# Setup logging
logfire.configure()

# Constants and environment variables
AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN', "dev-w0dm4z23pib7oeui.us.auth0.com")
API_AUDIENCE = os.getenv('API_AUDIENCE', "https://platogram.vercel.app/")
ALGORITHMS = ["RS256"]
JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
ASSEMBLYAI_API_KEY = os.getenv('ASSEMBLYAI_API_KEY')

if not ANTHROPIC_API_KEY or not ASSEMBLYAI_API_KEY:
    raise RuntimeError("API keys not set in environment variables.")

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

# Cache for the Auth0 public key
auth0_public_key_cache = {
    "key": None,
    "last_updated": 0,
    "expires_in": 3600,  # Cache expiration time in seconds (1 hour)
}

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

async def verify_token_and_get_user_id(token: str):
    try:
        public_key = await get_auth0_public_key()
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload["platogram:user_email"]
    except Exception as e:
        raise ValueError(f"Couldn't verify token: {str(e)}")

async def handle_convert(body: str, headers: Dict[str, str]):
    content_type = headers.get('Content-Type')
    token = headers.get('Authorization', '').split(' ')[1]

    try:
        user_id = await verify_token_and_get_user_id(token)

        if user_id in tasks and tasks[user_id]['status'] == "running":
            return {"statusCode": 400, "body": json.dumps({"error": "Conversion already in progress"})}

        if content_type == 'application/octet-stream':
            file_name = headers.get('X-File-Name')
            lang = headers.get('X-Language', 'en')

            temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file = temp_dir / f"{file_name}.part"

            with open(temp_file, 'wb') as f:
                f.write(body.encode())

            tasks[user_id] = {'status': 'running', 'file': str(temp_file), 'lang': lang}
        elif content_type == 'application/json':
            data = json.loads(body)
            url = data.get('url')
            lang = data.get('lang', 'en')
            tasks[user_id] = {'status': 'running', 'url': url, 'lang': lang}
        else:
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid content type"})}

        # Start background processing here
        # Note: In a serverless environment, you might need to use a separate service for long-running tasks
        asyncio.create_task(process_conversion(user_id))

        return {"statusCode": 200, "body": json.dumps({"message": "Conversion started"})}

    except Exception as e:
        logfire.exception(f"Error in convert: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

async def handle_status(headers: Dict[str, str]):
    token = headers.get('Authorization', '').split(' ')[1]

    try:
        user_id = await verify_token_and_get_user_id(token)

        if user_id not in tasks:
            response = {"status": "idle"}
        else:
            task = tasks[user_id]
            response = {
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }

        return {"statusCode": 200, "body": json.dumps(response)}

    except Exception as e:
        logfire.exception(f"Error in status: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

async def handle_reset(headers: Dict[str, str]):
    token = headers.get('Authorization', '').split(' ')[1]

    try:
        user_id = await verify_token_and_get_user_id(token)

        if user_id in tasks:
            del tasks[user_id]

        return {"statusCode": 200, "body": json.dumps({"message": "Session reset"})}

    except Exception as e:
        logfire.exception(f"Error in reset: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

async def process_conversion(user_id: str):
    try:
        task = tasks[user_id]

        # Here you would implement your actual conversion logic
        # For now, we'll just simulate processing
        await asyncio.sleep(10)

        # Simulating successful conversion
        tasks[user_id]['status'] = 'done'

        # Here you would typically send an email with the results
        # await send_email(user_id, "Conversion complete", "Your conversion is complete.")

    except Exception as e:
        logfire.exception(f"Error in conversion for user {user_id}: {str(e)}")
        tasks[user_id]['status'] = 'failed'
        tasks[user_id]['error'] = str(e)

def handler(event: Dict[str, Any], context: Any):
    path = event['path']
    http_method = event['httpMethod']
    headers = event['headers']
    body = event.get('body', '')

    async def async_handler():
        if http_method == 'GET':
            if path == '/status':
                return await handle_status(headers)
            elif path == '/reset':
                return await handle_reset(headers)
        elif http_method == 'POST' and path == '/convert':
            return await handle_convert(body, headers)

        return {"statusCode": 404, "body": json.dumps({"error": "Not Found"})}

    return asyncio.run(async_handler())