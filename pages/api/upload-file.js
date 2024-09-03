import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export const config = {
  runtime: 'edge',
};

async function verifyToken(token) {
  try {
    const JWKS = jose.createRemoteJWKSet(new URL('https://dev-w0dm4z23pib7oeui.us.auth0.com/.well-known/jwks.json'));
    const { payload } = await jwtVerify(token, JWKS, {
      audience: 'https://platogram.vercel.app/',
      issuer: 'https://dev-w0dm4z23pib7oeui.us.auth0.com/',
    });
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
}

export default async function handler(request) {
  if (request.method === 'POST') {
    try {
      // Extract the token from the Authorization header
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Unauthorized');
      }
      const token = authHeader.split(' ')[1];

      // Verify the Auth0 token
      const user = await verifyToken(token);

      const body = await request.json();

      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname) => {
          // Here you can implement your own logic to check if the user can upload
          const userCanUpload = true;
          if (!userCanUpload) {
            throw new Error('Not authorized to upload');
          }

          return {
            allowedContentTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'text/vtt', 'text/plain'],
            tokenPayload: JSON.stringify({
              userId: user.sub,
            }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          console.log('Blob upload completed', blob, tokenPayload);
          try {
            // Here you can run any logic after the file upload is completed
            const { userId } = JSON.parse(tokenPayload);
            // await db.update({ fileUrl: blob.url, userId });
          } catch (error) {
            console.error('Error in onUploadCompleted:', error);
            throw new Error('Could not process completed upload');
          }
        },
      });

      return NextResponse.json(jsonResponse);
    } catch (error) {
      console.error('Error in upload handler:', error);
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 400 }
      );
    }
  } else if (request.method === 'DELETE') {
    try {
      const { url: fileUrl } = await request.json();
      if (!fileUrl) {
        return NextResponse.json({ error: 'File URL is required for deletion' }, { status: 400 });
      }

      const { del } = await import('@vercel/blob');
      await del(fileUrl);

      return NextResponse.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
}