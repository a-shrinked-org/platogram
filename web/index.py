from web.main import handler

def handle(request):
    # Convert Vercel request to the format expected by our handler
    event = {
        'httpMethod': request.method,
        'path': request.url.path,
        'headers': dict(request.headers),
        'body': request.body.decode() if request.body else ''
    }

    # Call the handler function from main.py
    result = handler(event, None)

    # Convert the result to the format expected by Vercel
    return {
        'statusCode': result['statusCode'],
        'headers': result.get('headers', {}),
        'body': result['body']
    }