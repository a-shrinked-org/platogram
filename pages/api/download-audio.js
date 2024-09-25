import axios from 'axios';
import { pipeline } from 'stream/promises';

function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { url, title } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('Received download request for:', url);

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      });

      console.log('Successfully initiated audio stream');
      console.log('Content-Length:', response.headers['content-length']);
      console.log('Content-Type:', response.headers['content-type']);

      const sanitizedTitle = sanitizeFilename(title || 'audio');

      // Set the appropriate headers for file download
      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mp4');
      res.setHeader('Content-Length', response.headers['content-length']);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.m4a"`);

      // Use pipeline to handle the stream
      await pipeline(response.data, res);

      console.log('Audio file streamed successfully');
    } catch (error) {
      console.error('Error streaming audio:', error.message);
      if (error.response) {
        console.error('Error response:', error.response.status, error.response.data);
      }
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: 'An error occurred while streaming the audio', details: error.message });
      }
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}