from main import handler
import json

def vercel_handler(request):
    # Convert Vercel request to the format expected by our handler
    event = {
        'httpMethod': request.method,
        'path': request.url.path,
        'headers': dict(request.headers),
        'body': request.body.decode() if request.body else ''
    }

    response = handler(event, None)

    # Ensure the response is JSON serializable
    if isinstance(response['body'], str):
        try:
            json.loads(response['body'])
        except json.JSONDecodeError:
            response['body'] = json.dumps({'error': 'Internal server error'})

    return response