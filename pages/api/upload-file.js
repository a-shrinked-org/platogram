// api/upload-file.js
import { handleUpload } from '@vercel/blob/client';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: `https://dev-w0dm4z23pib7oeui.us.auth0.com/.well-known/jwks.json`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    var signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 600, // 10 minutes for very large uploads
    responseLimit: false,
  },
};

function debugLog(...args) {
  console.log('[DEBUG]', ...args);
}

async function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: 'https://platogram.vercel.app/',
      issuer: `https://dev-w0dm4z23pib7oeui.us.auth0.com/`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

export default async function handler(req, res) {
  debugLog('Request method:', req.method);
  debugLog('Request headers:', req.headers);

  if (req.method === 'POST') {
    try {
      debugLog('Starting POST request handling');

      // Extract the token from the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
      }
      const token = authHeader.split(' ')[1];

      // Verify the Auth0 token
      let decoded;
      try {
        decoded = await verifyToken(token);
        debugLog('Auth successful', decoded);
      } catch (error) {
        debugLog('Auth error:', error);
        throw new Error('Unauthorized');
      }

      // Check if this is a token request or an upload request
      const isTokenRequest = req.headers['x-vercel-blob-token-request'] === 'true';

      if (isTokenRequest) {
        // Return the Blob token for client-side uploads
        debugLog('Returning Blob token for client-side upload');
        return res.status(200).json({ token: process.env.BLOB_READ_WRITE_TOKEN });
      } else {
        // Handle server-side upload with multipart support
        debugLog('Initiating handleUpload with multipart support');
        const response = await handleUpload({
          body: req,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            debugLog('onBeforeGenerateToken called');
            return {
              allowedContentTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'text/vtt', 'text/plain'],
              maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5GB max
              cacheControlMaxAge: 31536000, // 1 year cache
              tokenPayload: JSON.stringify({
                userId: decoded.sub,
              }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            debugLog('Upload completed:', blob, tokenPayload);
            try {
              const { userId } = JSON.parse(tokenPayload);
              // You can add additional logic here if needed
              // For example: await db.update({ fileUrl: blob.url, userId });
            } catch (error) {
              console.error('Error in onUploadCompleted:', error);
              throw new Error('Could not process completed upload');
            }
          },
        });
        
        debugLog('Upload successful, sending response');
        return res.status(200).json(response);
      }
    } catch (error) {
      console.error('Error in upload handler:', error);
      debugLog('Error details:', error.stack);
      return res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    // DELETE handling remains the same
    debugLog('Handling DELETE request');
    try {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({});
          }
        });
      });
      const { url: fileUrl } = body;
      if (!fileUrl) {
        return res.status(400).json({ error: 'File URL is required for deletion' });
      }
      debugLog('Attempting to delete file:', fileUrl);
      const { del } = await import('@vercel/blob');
      await del(fileUrl);
      debugLog('File deleted successfully');
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(400).json({ error: 'Failed to delete file' });
    }
  } else {
    debugLog('Invalid method:', req.method);
    res.setHeader('Allow', ['POST', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}