// /api/upload-audio.js
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Auth0 JWT verification
const verifyToken = async (token) => {
  const client = jwksRsa({
    jwksUri: `https://dev-w0dm4z23pib7oeui.us.auth0.com/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
  });

  try {
    const decodedToken = jwt.decode(token, { complete: true });
    if (!decodedToken) throw new Error('Invalid token');

    const key = await client.getSigningKey(decodedToken.header.kid);
    const signingKey = key.getPublicKey();

    return jwt.verify(token, signingKey, {
      audience: 'https://platogram.vercel.app/',
      issuer: `https://dev-w0dm4z23pib7oeui.us.auth0.com/`,
      algorithms: ['RS256']
    });
  } catch (error) {
    throw new Error('Token verification failed');
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify Auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await verifyToken(token);

    // Get the user's email from the verified token
    const userEmail = decodedToken.email;

    // Get the audio file from the request
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response('No file provided', { status: 400 });
    }

    // Upload to Vercel Blob storage
    const blob = await put(file.name, file, {
      access: 'public',
    });

    // Forward the file URL to Platogram with the auth token
    const platogramResponse = await fetch('https://temporary.name/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        payload: blob.url,
        lang: 'en',
        price: 0,
        email: userEmail
      })
    });

    if (!platogramResponse.ok) {
      throw new Error(`Platogram API error: ${platogramResponse.statusText}`);
    }

    const platogramData = await platogramResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Audio file uploaded and processing started',
      url: blob.url,
      platogramResponse: platogramData
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Error processing upload:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}