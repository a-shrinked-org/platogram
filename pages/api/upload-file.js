// api/upload-file.js
import { del } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

function debugLog(message, data = '') {
  console.log(`[DEBUG] ${message}`, data);
}

export default async function handler(req, res) {
  debugLog('Received request:', req.method);
  const { put, handleUpload } = await import('@vercel/blob');

  try {
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'];
      debugLog('Content-Type:', contentType);

      if (contentType.startsWith('application/json')) {
        // This is a request for a client-side upload token or a completion notification
        debugLog('Handling client-side upload request');
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        const jsonResponse = await handleUpload({
          body,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            debugLog('Generating token for:', pathname);
            // You can add additional checks here
            return {
              allowedContentTypes: ['audio/*', 'video/*'],
              maximumSizeInBytes: 100 * 1024 * 1024, // 100MB for example
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            debugLog('Upload completed:', blob.url);
            // You can update your database here
            // For example: await updateDatabase(blob.url, tokenPayload);
          },
        });

        debugLog('Client-side upload handled successfully');
        return res.status(200).json(jsonResponse);
      } else {
        // This is a small file upload (< 4MB)
        debugLog('Handling small file upload');
        const { filename, contentType } = req.body;
        const file = req.body.file; // Assuming the file is sent in the request body

        if (!filename || !contentType || !file) {
          throw new Error('Missing required fields for file upload');
        }

        const blob = await put(filename, file, {
          contentType,
          access: 'public',
        });

        debugLog('Small file uploaded successfully:', blob.url);
        return res.status(200).json(blob);
      }
    } else if (req.method === 'DELETE') {
      debugLog('Handling DELETE request');
      const { fileUrl } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (!fileUrl) {
        throw new Error('File URL is required for deletion');
      }

      debugLog('Attempting to delete file:', fileUrl);
      await del(fileUrl);

      debugLog('File deleted successfully');
      return res.status(200).json({ message: 'File deleted successfully' });
    } else {
      debugLog('Invalid method:', req.method);
      res.setHeader('Allow', ['POST', 'DELETE']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error in upload-file handler:', error);
    const errorMessage = error.message || 'An unexpected error occurred';
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: errorMessage });
  }
}