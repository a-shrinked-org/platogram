// api/upload-file.js
import { put, del, handleUpload } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
  },
};

function debugLog(message, data = '') {
  console.log(`[DEBUG] ${message}`, data);
}

export default async function handler(req, res) {
  debugLog('Received request:', req.method);

  try {
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'];
      debugLog('Content-Type:', contentType);

      if (contentType?.startsWith('application/json')) {
        // This is a request for a client-side upload token or a completion notification
        debugLog('Handling client-side upload request');
        const jsonResponse = await handleUpload({
          request: req,
          response: res,
          onBeforeGenerateToken: async (pathname, clientPayload) => {
            debugLog('Generating token for:', pathname);
            // Authenticate and authorize users here before generating the token
            return {
              allowedContentTypes: ['audio/*', 'video/*', 'image/*'],
              maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
              tokenPayload: JSON.stringify({
                // You can include user ID or other data here
                // This will be available in onUploadCompleted
              }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            debugLog('Upload completed:', blob.url);
            // Here you can update your database with the blob URL
            // const { userId } = JSON.parse(tokenPayload);
            // await db.update({ avatar: blob.url, userId });
          },
        });
        debugLog('Client-side upload handled successfully');
        return res.status(200).json(jsonResponse);
      } else {
        // This is a small file upload (< 4MB)
        debugLog('Handling small file upload');
        const { filename, blob } = await put(req, {
          access: 'public',
        });
        debugLog('Small file uploaded successfully:', blob.url);
        return res.status(200).json(blob);
      }
    } else if (req.method === 'DELETE') {
      debugLog('Handling DELETE request');
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => { resolve(JSON.parse(data)); });
      });
      const { fileUrl } = body;
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