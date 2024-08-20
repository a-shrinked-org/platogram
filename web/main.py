import json
import os

# In-memory storage (Note: This will reset on each function invocation)
tasks = {}

def handler(event, context):
    path = event['path']
    http_method = event['httpMethod']
    headers = event['headers']
    body = event.get('body', '')

    if http_method == 'GET':
        if path == '/status':
            return handle_status(headers)
        elif path == '/reset':
            return handle_reset(headers)
    elif http_method == 'POST' and path == '/convert':
        return handle_convert(body, headers)

    return {"statusCode": 404, "body": json.dumps({"error": "Not Found"})}

def handle_convert(body, headers):
    try:
        content_type = headers.get('Content-Type')
        user_id = headers.get('Authorization', '').split(' ')[1]  # Simplified auth

        if user_id in tasks and tasks[user_id]['status'] == "running":
            return {"statusCode": 400, "body": json.dumps({"error": "Conversion already in progress"})}

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
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid content type"})}

        # Simulate starting background processing
        tasks[user_id]['status'] = 'processing'

        return {"statusCode": 200, "body": json.dumps({"message": "Conversion started"})}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

def handle_status(headers):
    try:
        user_id = headers.get('Authorization', '').split(' ')[1]  # Simplified auth

        if user_id not in tasks:
            response = {"status": "idle"}
        else:
            task = tasks[user_id]
            response = {
                "status": task['status'],
                "error": task.get('error') if task['status'] == "failed" else None
            }

        return {"statusCode": 200, "body": json.dumps(response)}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

def handle_reset(headers):
    try:
        user_id = headers.get('Authorization', '').split(' ')[1]  # Simplified auth

        if user_id in tasks:
            del tasks[user_id]

        return {"statusCode": 200, "body": json.dumps({"message": "Session reset"})}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

# Vercel requires a module-level handler function
def vercel_handler(event, context):
    return handler(event, context)