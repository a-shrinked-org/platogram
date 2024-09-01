import { put, del } from '@vercel/blob';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      // Ensure the request body is properly parsed
      const { filename, contentType } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (!filename || !contentType) {
        return res.status(400).json({ error: 'Missing filename or contentType' });
      }

      // Generate a signed URL for client-side upload
      const { url, headers } = await put(filename, {
        access: 'public',
        contentType: contentType,
      });

      return res.status(200).json({ url, headers });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      return res.status(500).json({ error: error.message || 'Failed to generate upload URL' });
    }
  } else if (req.method === 'DELETE') {
    try {
      // Ensure the request body is properly parsed
      const { fileUrl } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (!fileUrl) {
        return res.status(400).json({ error: 'File URL is required' });
      }

      // Extract the pathname from the URL
      const url = new URL(fileUrl);
      const pathname = url.pathname.split('/').pop(); // Get the filename

      await del(pathname);
      console.log('File deleted successfully:', pathname);
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete file' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};