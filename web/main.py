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

def json_response(handler, status_code, data):
    handler.send_response(status_code)
    handler.send_header('Content-type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Language')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

def get_auth0_public_key():
    # ... [keep the existing implementation] ...

def verify_token_and_get_email(token):
    # ... [keep the existing implementation] ...

def send_email_with_resend(to_email, subject, body, attachments):
    # ... [keep the existing implementation] ...

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
                tasks[task_id] = {'status': 'running', 'file': file_name, 'lang': lang, 'email': user_email}
                logger.debug(f"File upload received: {file_name}, Language: {lang}, Task ID: {task_id}")
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')  # JSON should be UTF-8
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[task_id] = {'status': 'running', 'url': url, 'lang': lang, 'email': user_email}
                logger.debug(f"URL conversion request received: {url}, Language: {lang}, Task ID: {task_id}")
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

                if user_email:
                    send_email_with_resend(user_email, subject, body, [sample_file])
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