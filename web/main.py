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
from uuid import uuid4

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
    handler.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Language')
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
        logger.info("No token provided")
        return None
    try:
        logger.info(f"Verifying token: {token[:10]}...{token[-10:]}")
        public_key = get_auth0_public_key()
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        logger.info(f"Token payload: {payload}")
        email = payload.get("platogram:user_email") or payload.get("email") or payload.get("https://platogram.com/user_email")
        logger.info(f"Extracted email from token: {email}")
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

def send_email_with_resend(to_email, subject, body, attachments):
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
        raise Exception(f"Failed to send email: {response.text}")

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
        logger.info(f"Authorization header: {auth_header}")
        if not auth_header:
            logger.warning("No Authorization header found")
            return None
        try:
            token = auth_header.split(' ')[1]
            email = verify_token_and_get_email(token)
            logger.info(f"User email extracted: {email}")
            return email
        except IndexError:
            logger.error("Malformed Authorization header")
            return None

    def handle_convert(self):
        logger.info("Handling /convert request")
        content_length = int(self.headers['Content-Length'])
        content_type = self.headers.get('Content-Type')
        user_email = self.get_user_email()
        logger.info(f"User email for conversion: {user_email}")

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
                logger.info(f"File upload received: {file_name}, Language: {lang}, Task ID: {task_id}, User Email: {user_email}")
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')  # JSON should be UTF-8
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[task_id] = {'status': 'running', 'url': url, 'lang': lang, 'email': user_email}
                logger.info(f"URL conversion request received: {url}, Language: {lang}, Task ID: {task_id}, User Email: {user_email}")
            else:
                logger.error(f"Invalid content type: {content_type}")
                json_response(self, 400, {"error": "Invalid content type"})
                return

            # Start processing
            tasks[task_id]['status'] = 'processing'
            self.process_and_send_email(task_id)

            json_response(self, 200, {"message": "Conversion started", "task_id": task_id})
        except Exception as e:
            logger.error(f"Error in handle_convert: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def process_and_send_email(self, task_id):
        try:
            task = tasks[task_id]
            user_email = task['email']
            logger.info(f"Starting processing for task {task_id}, User Email: {user_email}")

            # Simulate processing
            time.sleep(5)  # Simulate work

            # Generate sample output files
            with tempfile.TemporaryDirectory() as tmpdir:
                sample_file = Path(tmpdir) / "sample_output.txt"
                with open(sample_file, 'w') as f:
                    f.write("This is a sample output file.")

                # Generate a simple PDF for testing
                pdf_file = Path(tmpdir) / "output.pdf"
                with open(pdf_file, 'w') as f:
                    f.write("%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Hello, this is a sample PDF.) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000212 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n316\n%%EOF")

                subject = "[Platogram] Your Converted Document"
                body = """Hi there!

Platogram has transformed spoken words into documents you can read and enjoy!

Please find the converted document attached to this email.

Thank you for using Platogram!

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

                if user_email:
                    logger.info(f"Sending email to {user_email}")
                    send_email_with_resend(user_email, subject, body, [sample_file, pdf_file])
                    logger.info("Email sent successfully")
                else:
                    logger.warning(f"No email available for task {task_id}. Skipping email send.")

            tasks[task_id]['status'] = 'done'
            logger.info(f"Conversion completed for task {task_id}")
        except Exception as e:
            logger.error(f"Error in process_and_send_email for task {task_id}: {str(e)}")
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
    return handler.handle_request(event, context)