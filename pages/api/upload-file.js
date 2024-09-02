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
      const response = await handleUpload({
        request: req,
        // Remove the 'body: req' line as it's not needed and not mentioned in the docs
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          debugLog('Generating token for:', pathname);
          // Authenticate and authorize users here before generating the token
          // You may want to add actual authentication logic here
          return {
            allowedContentTypes: ['audio/*', 'video/*', 'image/*'],
            maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
            tokenPayload: JSON.stringify({
              // You can include user ID or other data here
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
      return res.status(200).json(response);
    } catch (error) {
      console.error('Error in upload-file handler:', error);
      // Added specific handling for BlobAccessError as per documentation
      if (error instanceof BlobAccessError) {
        return res.status(403).json({ error: 'Access denied to Blob store' });
      }
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    debugLog('Handling DELETE request');
    try {
      // Since bodyParser is false, we need to parse the body manually
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => { resolve(JSON.parse(data)); });
      });

      const { fileUrl } = body;
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
      if (error instanceof BlobAccessError) {
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