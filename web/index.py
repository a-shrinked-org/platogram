from main import vercel_handler

def handle_vercel_request(request):
    # Convert Vercel request to the format expected by our handler
    event = {
        'httpMethod': request.method,
        'path': request.url.path,
        'headers': dict(request.headers),
        'body': request.body.decode() if request.body else ''
    }

    # Call the vercel_handler from main.py
    return vercel_handler(event, None)