import os
import json
import asyncio
import tempfile
import logfire
import time
from pathlib import Path
from typing import Optional, Literal
from datetime import datetime
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

Language = Literal["en", "es"]

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

async def handle_convert(scope, receive, send):
    try:
        body = await receive_body(receive)
        content_type = next((v.decode() for k, v in scope['headers'] if k.decode().lower() == 'content-type'), None)
        token = next((v.decode().split(' ')[1] for k, v in scope['headers'] if k.decode().lower() == 'authorization'), None)

        if not token:
            return await send_json_response(send, {"error": "No authorization token provided"}, status=401)

        user_id = await verify_token_and_get_user_id(token)

        if user_id in tasks and tasks[user_id]['status'] == "running":
            return await send_json_response(send, {"error": "Conversion already in progress"}, status=400)

        if content_type == 'application/octet-stream':
            file_name = next((v.decode() for k, v in scope['headers'] if k.decode().lower() == 'x-file-name'), None)
            lang = next((v.decode() for k, v in scope['headers'] if k.decode().lower() == 'x-language'), 'en')

            temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_file = temp_dir / f"{file_name}.part"

            with open(temp_file, 'wb') as f:
                f.write(body)

            tasks[user_id] = {'status': 'running', 'file': str(temp_file), 'lang': lang}
        elif content_type == 'application/json':
            data = json.loads(body)
            url = data.get('url')
            lang = data.get('lang', 'en')
            tasks[user_id] = {'status': 'running', 'url': url, 'lang': lang}
        else:
            return await send_json_response(send, {"error": "Invalid content type"}, status=400)

        # Start background processing here
        asyncio.create_task(process_conversion(user_id))

        return await send_json_response(send, {"message": "Conversion started"})

    except Exception as e:
        logfire.exception(f"Error in convert: {str(e)}")
        return await send_json_response(send, {"error": str(e)}, status=500)

async def handle_status(scope, receive, send):
    try:
        token = next((v.decode().split(' ')[1] for k, v in scope['headers'] if k.decode().lower() == 'authorization'), None)

        if not token:
            return await send_json_response(send, {"error": "No authorization token provided"}, status=401)

        user_id = await verify_token_and_get_user_id(token)

        if user_id not in tasks:
            return await send_json_response(send, {"status": "idle"})

        task = tasks[user_id]
        return await send_json_response(send, {
            "status": task['status'],
            "error": task.get('error') if task['status'] == "failed" else None
        })

    except Exception as e:
        logfire.exception(f"Error in status: {str(e)}")
        return await send_json_response(send, {"error": str(e)}, status=500)

async def handle_reset(scope, receive, send):
    try:
        token = next((v.decode().split(' ')[1] for k, v in scope['headers'] if k.decode().lower() == 'authorization'), None)

        if not token:
            return await send_json_response(send, {"error": "No authorization token provided"}, status=401)

        user_id = await verify_token_and_get_user_id(token)

        if user_id in tasks:
            del tasks[user_id]

        return await send_json_response(send, {"message": "Session reset"})

    except Exception as e:
        logfire.exception(f"Error in reset: {str(e)}")
        return await send_json_response(send, {"error": str(e)}, status=500)

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

async def app(scope, receive, send):
    assert scope['type'] == 'http'

    if scope['method'] == 'GET':
        if scope['path'] == '/status':
            await handle_status(scope, receive, send)
        elif scope['path'] == '/reset':
            await handle_reset(scope, receive, send)
        else:
            await send_not_found(send)
    elif scope['method'] == 'POST' and scope['path'] == '/convert':
        await handle_convert(scope, receive, send)
    else:
        await send_not_found(send)

async def receive_body(receive):
    body = b''
    more_body = True
    while more_body:
        message = await receive()
        body += message.get('body', b'')
        more_body = message.get('more_body', False)
    return body

async def send_json_response(send, data, status=200):
    await send({
        'type': 'http.response.start',
        'status': status,
        'headers': [
            [b'content-type', b'application/json'],
        ],
    })
    await send({
        'type': 'http.response.body',
        'body': json.dumps(data).encode(),
    })

async def send_not_found(send):
    await send({
        'type': 'http.response.start',
        'status': 404,
        'headers': [
            [b'content-type', b'text/plain'],
        ],
    })
    await send({
        'type': 'http.response.body',
        'body': b'Not Found',
    })

# Vercel handler
def handler(request, response):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(app(request, lambda: None, response))