import { put } from '@vercel/blob';
import { auth } from 'express-oauth2-jwt-bearer';
import formidable from 'formidable';

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
  debugLog('Request method:', req.method);
  debugLog('Request headers:', req.headers);

  if (req.method === 'POST') {
    try {
      debugLog('Starting POST request handling');

      // Verify the Auth0 token
      await new Promise((resolve, reject) => {
        checkJwt(req, res, (err) => {
          if (err) {
            debugLog('Auth error:', err);
            reject(new Error('Unauthorized'));
          } else {
            debugLog('Auth successful');
            resolve();
          }
        });
      });

      const form = new formidable.IncomingForm();
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      });

      debugLog('File received:', files.file);

      const file = files.file;
      const blob = await put(file.originalFilename, file, {
        access: 'public',
      });

      debugLog('Upload successful, sending response');
      return res.status(200).json({ url: blob.url });
    } catch (error) {
      console.error('Error in upload handler:', error);
      debugLog('Error details:', error.stack);
      return res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
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