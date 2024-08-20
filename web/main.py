from http.server import BaseHTTPRequestHandler
import json
import os
import asyncio
import tempfile
from pathlib import Path
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import logging
from concurrent.futures import ThreadPoolExecutor

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

# Environment variables
SMTP_USER = os.getenv("GMAIL_USER")
SMTP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

def json_response(handler, status_code, data):
    handler.send_response(status_code)
    handler.send_header('Content-type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

def send_email(user_id: str, subj: str, body: str, files: list[Path]):
    logger.info(f"Sending email to {user_id}")
    msg = MIMEMultipart()
    msg['From'] = SMTP_USER
    msg['To'] = user_id
    msg['Subject'] = subj

    msg.attach(MIMEText(body, 'plain'))

    for file in files:
        with open(file, "rb") as f:
            part = MIMEApplication(f.read(), Name=file.name)
        part['Content-Disposition'] = f'attachment; filename="{file.name}"'
        msg.attach(part)

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        logger.info(f"Email sent to {user_id}")
    except Exception as e:
        logger.error(f"Failed to send email to {user_id}: {str(e)}")
        raise

def process_conversion(user_id):
    try:
        task = tasks[user_id]

        # Simulate processing steps
        steps = ["Initializing", "Processing", "Finalizing"]
        for step in steps:
            logger.info(f"Processing step: {step}")
            # Simulate work
            time.sleep(1)

        # Simulate result
        result = {
            "title": "Sample Conversion",
            "summary": "This is a sample summary of the converted content."
        }

        # Create sample output files
        with tempfile.TemporaryDirectory() as tmpdir:
            sample_file = Path(tmpdir) / "sample_output.txt"
            with open(sample_file, 'w') as f:
                f.write("This is a sample output file.")

            # Send email with the result
            subject = f"[Platogram] {result['title']}"
            body = f"""Hi there!

Platogram transformed spoken words into documents you can read and enjoy!

{result['summary']}

Please reply to this email if you have any suggestions, feedback, or questions.

---
Support Platogram by donating here: https://buy.stripe.com/eVa29p3PK5OXbq84gl
Suggested donation: $2 per hour of content converted."""

            send_email(user_id, subject, body, [sample_file])

        tasks[user_id]['status'] = 'done'

    except Exception as e:
        logger.exception(f"Error in conversion for user {user_id}: {str(e)}")
        tasks[user_id]['status'] = 'failed'
        tasks[user_id]['error'] = str(e)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/convert':
            self.handle_convert()
        else:
            self.send_error(404, "Not Found")

    def do_GET(self):
        if self.path == '/status':
            self.handle_status()
        elif self.path == '/reset':
            self.handle_reset()
        else:
            self.send_error(404, "Not Found")

    def handle_convert(self):
        content_length = int(self.headers['Content-Length'])
        content_type = self.headers.get('Content-Type')
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth

        try:
            if user_id in tasks and tasks[user_id]['status'] == "running":
                json_response(self, 400, {"error": "Conversion already in progress"})
                return

            if content_type == 'application/octet-stream':
                body = self.rfile.read(content_length)
                file_name = self.headers.get('X-File-Name')
                lang = self.headers.get('X-Language', 'en')

                temp_dir = Path(tempfile.gettempdir()) / "platogram_uploads"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file = temp_dir / f"{file_name}.part"

                with open(temp_file, 'wb') as f:
                    f.write(body)

                tasks[user_id] = {'status': 'running', 'file': str(temp_file), 'lang': lang}
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[user_id] = {'status': 'running', 'url': url, 'lang': lang}
            else:
                json_response(self, 400, {"error": "Invalid content type"})
                return

            # Start background processing
            with ThreadPoolExecutor() as executor:
                executor.submit(process_conversion, user_id)

            json_response(self, 200, {"message": "Conversion started"})
        except Exception as e:
            logger.exception(f"Error in handle_convert: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def handle_status(self):
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth
        try:
            if user_id not in tasks:
                response = {"status": "idle"}
            else:
                task = tasks[user_id]
                response = {
                    "status": task['status'],
                    "error": task.get('error') if task['status'] == "failed" else None
                }
            json_response(self, 200, response)
        except Exception as e:
            logger.exception(f"Error in handle_status: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def handle_reset(self):
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth
        try:
            if user_id in tasks:
                del tasks[user_id]
            json_response(self, 200, {"message": "Session reset"})
        except Exception as e:
            logger.exception(f"Error in handle_reset: {str(e)}")
            json_response(self, 500, {"error": str(e)})

# Vercel handler
def vercel_handler(event, context):
    return handler.handle_request(event, context)