from http.server import BaseHTTPRequestHandler
import json
import os
import logging
import tempfile
from pathlib import Path
import base64
import requests
from jose import jwt  # For decoding the JWT token

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
AUTH0_CLIENT_ID = os.getenv('AUTH0_CLIENT_ID')

def json_response(handler, status_code, data):
    handler.send_response(status_code)
    handler.send_header('Content-type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

def get_email_from_token(token):
    try:
        # Decode the token
        decoded_token = jwt.decode(token, options={"verify_signature": False})  # Typically, you should verify the signature
        return decoded_token.get('email')
    except Exception as e:
        logger.error(f"Error decoding token: {str(e)}")
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

    def handle_convert(self):
        content_length = int(self.headers['Content-Length'])
        content_type = self.headers.get('Content-Type')
        authorization_header = self.headers.get('Authorization', '')
        token = authorization_header.split(' ')[1]  # Simplified auth

        try:
            email = get_email_from_token(token)
            if not email:
                json_response(self, 400, {"error": "Invalid token"})
                return

            if email in tasks and tasks[email]['status'] == "running":
                json_response(self, 400, {"error": "Conversion already in progress"})
                return

            if content_type == 'application/octet-stream':
                body = self.rfile.read(content_length)  # Read raw bytes
                file_name = self.headers.get('X-File-Name')
                lang = self.headers.get('X-Language', 'en')
                tasks[email] = {'status': 'running', 'file': file_name, 'lang': lang}
                logger.info(f"File upload received for user {email}: {file_name}")
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')  # JSON should be UTF-8
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[email] = {'status': 'running', 'url': url, 'lang': lang}
                logger.info(f"URL conversion request received for user {email}: {url}")
            else:
                json_response(self, 400, {"error": "Invalid content type"})
                return

            # Simulate starting background processing
            tasks[email]['status'] = 'processing'

            # Simulate processing and send email
            self.process_and_send_email(email)

            json_response(self, 200, {"message": "Conversion started"})
        except Exception as e:
            logger.error(f"Error in handle_convert for user {email}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def process_and_send_email(self, email):
        try:
            # Simulate processing
            import time
            time.sleep(5)  # Simulate work

            # Generate sample output files
            with tempfile.TemporaryDirectory() as tmpdir:
                sample_file = Path(tmpdir) / "sample_output.txt"
                with open(sample_file, 'w') as f:
                    f.write("This is a sample output file.")

                # Prepare email content
                subject = "[Platogram] Your Converted Document"
                body = """Hi there!

Platogram has transformed spoken words into documents you can read and enjoy!

Please find the converted document attached to this email.

Thank you for using Platogram!

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

                # Send email with attachment
                send_email_with_resend(email, subject, body, [sample_file])

            tasks[email]['status'] = 'done'
            logger.info(f"Conversion completed for user {email}")
        except Exception as e:
            logger.error(f"Error in process_and_send_email for user {email}: {str(e)}")
            tasks[email]['status'] = 'failed'
            tasks[email]['error'] = str(e)

    def handle_status(self):
        authorization_header = self.headers.get('Authorization', '')
        token = authorization_header.split(' ')[1]  # Simplified auth
        email = get_email_from_token(token)
        try:
            if email not in tasks:
                response = {"status": "idle"}
            else:
                task = tasks[email]
                response = {
                    "status": task['status'],
                    "error": task.get('error') if task['status'] == "failed" else None
                }
            json_response(self, 200, response)
        except Exception as e:
            logger.error(f"Error in handle_status for user {email}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def handle_reset(self):
        authorization_header = self.headers.get('Authorization', '')
        token = authorization_header.split(' ')[1]  # Simplified auth
        email = get_email_from_token(token)
        try:
            if email in tasks:
                del tasks[email]
            json_response(self, 200, {"message": "Session reset"})
        except Exception as e:
            logger.error(f"Error in handle_reset for user {email}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

# Vercel handler
def vercel_handler(event, context):
    return handler.handle_request(event, context)