import { handleUpload } from '@vercel/blob/client';
import { auth } from 'express-oauth2-jwt-bearer';

// Configure Auth0 middleware
const checkJwt = auth({
  audience: 'https://platogram.vercel.app/',
  issuerBaseURL: `https://dev-w0dm4z23pib7oeui.us.auth0.com/`,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

function debugLog(...args) {
  console.log('[DEBUG]', ...args);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Verify the Auth0 token
      await new Promise((resolve, reject) => {
        checkJwt(req, res, (err) => {
          if (err) {
            reject(new Error('Unauthorized'));
          } else {
            resolve();
          }
        });
      });

      const body = await req.json();
      const jsonResponse = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          // The user is already authenticated by this point
          const user = req.auth.payload;
          // Here you can implement your own logic to check if the user can upload
          // For now, we'll assume all authenticated users can upload
          const userCanUpload = true;
          if (!userCanUpload) {
            throw new Error('Not authorized to upload');
          }
          return {
            allowedContentTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'text/vtt', 'text/plain'],
            tokenPayload: JSON.stringify({
              userId: user.sub, // Auth0 uses 'sub' for user ID
            }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          console.log('Blob upload completed', blob, tokenPayload);
          try {
            // Here you can run any logic after the file upload is completed
            // For example, you might want to save the blob URL to your database
            const { userId } = JSON.parse(tokenPayload);
            // await db.update({ fileUrl: blob.url, userId });
          } catch (error) {
            console.error('Error in onUploadCompleted:', error);
            throw new Error('Could not process completed upload');
          }
        },
      });

      return res.status(200).json(jsonResponse);
    } catch (error) {
      console.error('Error in upload handler:', error);
      return res.status(error.message === 'Unauthorized' ? 401 : 400).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
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