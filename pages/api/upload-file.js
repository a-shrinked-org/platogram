import { put } from '@vercel/blob';
import { del } from '@vercel/blob';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'POST') {
    try {
      const { filename, contentType } = await req.json();

      // Generate a signed URL for client-side upload
      const { url, headers } = await put(filename, {
        access: 'public',
        contentType: contentType,
      });

      return res.status(200).json({ url, headers });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
  } else if (req.method === 'DELETE') {
    try {
      const { fileUrl } = await req.json(); // Parse JSON body for DELETE request

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
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}