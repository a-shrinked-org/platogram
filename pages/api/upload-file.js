// pages/api/upload-file.js
import { handleUpload } from '@vercel/blob/client';
import { put } from '@vercel/blob';
import { IncomingForm } from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

function debugLog(message, data = '') {
  console.log(`[DEBUG] ${message}`, data);
}

export default async function handler(req, res) {
  debugLog('Received request:', req.method);

  if (req.method === 'POST') {
    return new Promise((resolve, reject) => {
      const form = new IncomingForm();

      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('Error parsing form:', err);
          res.status(500).json({ error: 'Error parsing form' });
          return resolve();
        }

        const file = files.file?.[0]; // formidable v3 returns an array for each field
        if (!file) {
          res.status(400).json({ error: 'No file uploaded' });
          return resolve();
        }

        debugLog('File received:', file.originalFilename);

        try {
          const blob = await put(file.originalFilename, file, {
            access: 'public',
          });

          debugLog('File uploaded to Vercel Blob:', blob.url);
          res.status(200).json({ url: blob.url });
        } catch (uploadError) {
          console.error('Error uploading to Vercel Blob:', uploadError);
          res.status(500).json({ error: 'Error uploading file to storage' });
        }
        resolve();
      });
    });
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