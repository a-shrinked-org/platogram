from http.server import BaseHTTPRequestHandler
import json
import os
import logging
import asyncio

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

async def stream_response(writer, data):
    for chunk in data:
        await writer.write(chunk.encode())
        await writer.flush()

class handler(BaseHTTPRequestHandler):
    async def do_GET(self):
        try:
            if self.path == '/status':
                await self.handle_status()
            elif self.path == '/reset':
                await self.handle_reset()
            else:
                self.send_error(404, "Not Found")
        except Exception as e:
            logger.exception("Error in GET request")
            self.send_error(500, str(e))

    async def do_POST(self):
        try:
            if self.path == '/convert':
                await self.handle_convert()
            else:
                self.send_error(404, "Not Found")
        except Exception as e:
            logger.exception("Error in POST request")
            self.send_error(500, str(e))

    async def handle_convert(self):
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length)
        content_type = self.headers.get('Content-Type')
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth

        logger.debug(f"Received convert request: content_type={content_type}, user_id={user_id}")

        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()

        async def stream_conversion():
            try:
                yield "Starting conversion process...\n"

                if content_type == 'application/octet-stream':
                    file_name = self.headers.get('X-File-Name')
                    lang = self.headers.get('X-Language', 'en')
                    tasks[user_id] = {'status': 'running', 'file': file_name, 'lang': lang}
                    logger.debug(f"File upload: file_name={file_name}, lang={lang}")
                    yield f"Processing file: {file_name}\n"
                elif content_type == 'application/json':
                    data = json.loads(body)
                    url = data.get('url')
                    lang = data.get('lang', 'en')
                    tasks[user_id] = {'status': 'running', 'url': url, 'lang': lang}
                    logger.debug(f"URL conversion: url={url}, lang={lang}")
                    yield f"Processing URL: {url}\n"
                else:
                    yield "Invalid content type\n"
                    return

                # Simulate processing steps
                steps = ["Initializing", "Processing", "Finalizing"]
                for step in steps:
                    yield f"{step}...\n"
                    await asyncio.sleep(1)  # Simulate work

                tasks[user_id]['status'] = 'done'
                yield "Conversion process completed.\n"

            except Exception as e:
                logger.exception("Error in conversion process")
                tasks[user_id]['status'] = 'failed'
                tasks[user_id]['error'] = str(e)
                yield f"Error: {str(e)}\n"

        await stream_response(self.wfile, stream_conversion())

    async def handle_status(self):
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth
        logger.debug(f"Status request for user_id={user_id}")

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()

        if user_id not in tasks:
            response = {"status": "idle"}
        else:
            task = tasks[user_id]
            response = {
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }

        self.wfile.write(json.dumps(response).encode())

    async def handle_reset(self):
        user_id = self.headers.get('Authorization', '').split(' ')[1]  # Simplified auth
        logger.debug(f"Reset request for user_id={user_id}")

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()

        if user_id in tasks:
            del tasks[user_id]

        self.wfile.write(json.dumps({"message": "Session reset"}).encode())

def vercel_handler(event, context):
    return asyncio.run(handler.handle_request(event, context))