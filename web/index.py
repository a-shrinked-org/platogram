from main import handler
import json
import asyncio

def handle_vercel_request(request):
    # Convert Vercel request to the format expected by our handler
    event = {
        'httpMethod': request.method,
        'path': request.url.path,
        'headers': dict(request.headers),
        'body': request.body.decode() if request.body else ''
    }

    # Call the vercel_handler from main.py
    response = vercel_handler(event, None)

    # Ensure the response is JSON serializable
    if isinstance(response['body'], str):
        try:
            json.loads(response['body'])
        except json.JSONDecodeError:
            response['body'] = json.dumps({'error': 'Internal server error'})

    return response