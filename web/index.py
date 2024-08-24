from main import handler

# Vercel will use this as the entry point
def vercel_handler(request):
    return handler(request, None)