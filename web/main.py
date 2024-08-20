from http.server import BaseHTTPRequestHandler
import json
import os

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

def json_response(status_code, data):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(data)
    }

def handle_request(event):
    method = event['httpMethod']
    path = event['path']
    headers = event['headers']
    body = event.get('body', '')

    if method == 'GET':
        if path == '/status':
            return handle_status(headers)
        elif path == '/reset':
            return handle_reset(headers)
        else:
            return json_response(404, {"error": "Not Found"})
    elif method == 'POST' and path == '/convert':
        return handle_convert(headers, body)
    else:
        return json_response(404, {"error": "Not Found"})

def handle_convert(headers, body):
    content_type = headers.get('Content-Type')
    user_id = headers.get('Authorization', '').split(' ')[1]  # Simplified auth

    try:
        if user_id in tasks and tasks[user_id]['status'] == "running":
            return json_response(400, {"error": "Conversion already in progress"})

        if content_type == 'application/octet-stream':
            file_name = headers.get('X-File-Name')
            lang = headers.get('X-Language', 'en')
            tasks[user_id] = {'status': 'running', 'file': file_name, 'lang': lang}
        elif content_type == 'application/json':
            data = json.loads(body)
            url = data.get('url')
            lang = data.get('lang', 'en')
            tasks[user_id] = {'status': 'running', 'url': url, 'lang': lang}
        else:
            return json_response(400, {"error": "Invalid content type"})

        # Simulate starting background processing
        tasks[user_id]['status'] = 'processing'
        return json_response(200, {"message": "Conversion started"})
    except Exception as e:
        return json_response(500, {"error": str(e)})

def handle_status(headers):
    user_id = headers.get('Authorization', '').split(' ')[1]  # Simplified auth
    try:
        if user_id not in tasks:
            response = {"status": "idle"}
        else:
            task = tasks[user_id]
            response = {
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }
        return json_response(200, response)
    except Exception as e:
        return json_response(500, {"error": str(e)})

def handle_reset(headers):
    user_id = headers.get('Authorization', '').split(' ')[1]  # Simplified auth
    try:
        if user_id in tasks:
            del tasks[user_id]
        return json_response(200, {"message": "Session reset"})
    except Exception as e:
        return json_response(500, {"error": str(e)})

def handler(event, context):
    return handle_request(event)