from http.server import BaseHTTPRequestHandler
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

# Setup logging
logging.basicConfig(level=logging.INFO)
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

def json_response(handler, status_code, data):
    handler.send_response(status_code)
    handler.send_header('Content-type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

def get_auth0_public_key():
    current_time = time.time()
    if (
        auth0_public_key_cache["key"]
        and current_time - auth0_public_key_cache["last_updated"]
        < auth0_public_key_cache["expires_in"]
    ):
        return auth0_public_key_cache["key"]

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
        return None
    try:
        public_key = get_auth0_public_key()
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload.get("platogram:user_email") or payload.get("email") or payload.get("https://platogram.com/user_email")
    except Exception as e:
        logger.error(f"Couldn't verify token: {str(e)}")
        return None

def send_email_with_resend(to_email, subject, body, attachments):
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
            encoded_content = base64.b64encode(content).decode()
            payload["attachments"].append({
                "filename": Path(attachment).name,
                "content": encoded_content
            })

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        logger.info(f"Email sent successfully to {to_email}")
    else:
        logger.error(f"Failed to send email. Status: {response.status_code}, Error: {response.text}")

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
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
        if not auth_header:
            return None
        try:
            token = auth_header.split(' ')[1]
            return verify_token_and_get_email(token)
        except IndexError:
            return None

    def handle_convert(self):
        content_length = int(self.headers['Content-Length'])
        content_type = self.headers.get('Content-Type')
        user_email = self.get_user_email()

        if not user_email:
            json_response(self, 401, {"error": "Authentication required"})
            return

        try:
            if user_email in tasks and tasks[user_email]['status'] == "running":
                json_response(self, 400, {"error": "Conversion already in progress"})
                return

            if content_type == 'application/octet-stream':
                body = self.rfile.read(content_length)  # Read raw bytes
                file_name = self.headers.get('X-File-Name')
                lang = self.headers.get('X-Language', 'en')
                tasks[user_email] = {'status': 'running', 'file': file_name, 'lang': lang}
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')  # JSON should be UTF-8
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[user_email] = {'status': 'running', 'url': url, 'lang': lang}
            else:
                json_response(self, 400, {"error": "Invalid content type"})
                return

            # Start processing
            tasks[user_email]['status'] = 'processing'
            self.process_and_send_email(user_email)

            json_response(self, 200, {"message": "Conversion started"})
        except Exception as e:
            logger.error(f"Error in handle_convert: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def process_and_send_email(self, user_email):
        try:
            # Simulate processing
            time.sleep(5)  # Simulate work

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

                send_email_with_resend(user_email, subject, body, [sample_file])

            tasks[user_email]['status'] = 'done'
            logger.info(f"Conversion completed for user {user_email}")
        except Exception as e:
            logger.error(f"Error in process_and_send_email for user {user_email}: {str(e)}")
            tasks[user_email]['status'] = 'failed'
            tasks[user_email]['error'] = str(e)

    def handle_status(self):
        user_email = self.get_user_email()

        if not user_email:
            # Return a generic status for unauthenticated requests
            json_response(self, 200, {"status": "idle"})
            return

        try:
            if user_email not in tasks:
                response = {"status": "idle"}
            else:
                task = tasks[user_email]
                response = {
                    "status": task['status'],
                    "error": task.get('error') if task['status'] == "failed" else None
                }
            json_response(self, 200, response)
        except Exception as e:
            logger.error(f"Error in handle_status for user {user_email}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def handle_reset(self):
        user_email = self.get_user_email()

        if not user_email:
            json_response(self, 401, {"error": "Authentication required"})
            return

        try:
            if user_email in tasks:
                del tasks[user_email]
            json_response(self, 200, {"message": "Session reset"})
        except Exception as e:
            logger.error(f"Error in handle_reset for user {user_email}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

# Vercel handler
def vercel_handler(event, context):
    return handler.handle_request(event, context)