from main import handler
from http.server import BaseHTTPRequestHandler
from io import BytesIO

class VercelHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.handle_request('GET')

    def do_POST(self):
        self.handle_request('POST')

    def do_OPTIONS(self):
        self.handle_request('OPTIONS')

    def handle_request(self, method):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode() if content_length > 0 else ''

        event = {
            'httpMethod': method,
            'path': self.path,
            'headers': dict(self.headers),
            'body': body
        }

        result = handler(event, None)

        self.send_response(result['statusCode'])
        for key, value in result.get('headers', {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(result['body'].encode())

def vercel_handler(request, response):
    handler = VercelHandler(request, response, None)
    handler.handle_request(request.method)