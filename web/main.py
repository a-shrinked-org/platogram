from http.server import BaseHTTPRequestHandler
import json
import os
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

def json_response(handler, status_code, data):
    handler.send_response(status_code)
    handler.send_header('Content-type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

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
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth

        try:
            if user_id in tasks and tasks[user_id]['status'] == "running":
                json_response(self, 400, {"error": "Conversion already in progress"})
                return

            if content_type == 'application/octet-stream':
                body = self.rfile.read(content_length)  # Read raw bytes
                file_name = self.headers.get('X-File-Name')
                lang = self.headers.get('X-Language', 'en')
                tasks[user_id] = {'status': 'running', 'file': file_name, 'lang': lang}
                logger.info(f"File upload received for user {user_id}: {file_name}")
            elif content_type == 'application/json':
                body = self.rfile.read(content_length).decode('utf-8')  # JSON should be UTF-8
                data = json.loads(body)
                url = data.get('url')
                lang = data.get('lang', 'en')
                tasks[user_id] = {'status': 'running', 'url': url, 'lang': lang}
                logger.info(f"URL conversion request received for user {user_id}: {url}")
            else:
                json_response(self, 400, {"error": "Invalid content type"})
                return

            # Simulate starting background processing
            tasks[user_id]['status'] = 'processing'
            json_response(self, 200, {"message": "Conversion started"})
        except Exception as e:
            logger.error(f"Error in handle_convert for user {user_id}: {str(e)}")
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
            logger.error(f"Error in handle_status for user {user_id}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

    def handle_reset(self):
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth
        try:
            if user_id in tasks:
                del tasks[user_id]
            json_response(self, 200, {"message": "Session reset"})
        except Exception as e:
            logger.error(f"Error in handle_reset for user {user_id}: {str(e)}")
            json_response(self, 500, {"error": str(e)})

# Vercel handler
def vercel_handler(event, context):
    return handler.handle_request(event, context)