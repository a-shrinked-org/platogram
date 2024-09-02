// pages/api/upload-file.js
import { handleUpload, BlobAccessError } from '@vercel/blob/client';

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
    try {
      // Parse the request body
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

      debugLog('Request body:', JSON.stringify(body));

      // Check if this is a token request or an upload completion webhook
      if (body.filename && body.contentType) {
        // This is likely a token request
        const response = await handleUpload({
          body: {
            ...body,
            type: 'blob.generate-client-token',
          },
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            debugLog('Generating token for:', pathname);
            // Authenticate and authorize users here before generating the token
            return {
              allowedContentTypes: ['audio/*', 'video/*', 'image/*'],
              maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
              tokenPayload: JSON.stringify({
                // You can include user ID or other data here
              }),
            };
          },
        });

        debugLog('Token generated successfully');
        return res.status(200).json(response);
      } else if (body.type === 'blob.upload-completed') {
        // This is an upload completion webhook
        await handleUpload({
          body,
          request: req,
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            debugLog('Upload completed:', blob.url);
            // Here you can update your database with the blob URL
            // const { userId } = JSON.parse(tokenPayload);
            // await db.update({ avatar: blob.url, userId });
          },
        });

        debugLog('Upload completion handled successfully');
        return res.status(200).json({ message: 'Upload completed' });
      } else {
        throw new Error('Invalid request body');
      }
    } catch (error) {
      console.error('Error in upload-file handler:', error);
      if (error.name === 'BlobAccessError') {
        return res.status(403).json({ error: 'Access denied to Blob store' });
      }
      return res.status(500).json({ error: error.message || 'An unexpected error occurred' });
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
      if (error.name === 'BlobAccessError') {
        return res.status(403).json({ error: 'Access denied to Blob store' });
      }
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  } else {
    debugLog('Invalid method:', req.method);
    res.setHeader('Allow', ['POST', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}