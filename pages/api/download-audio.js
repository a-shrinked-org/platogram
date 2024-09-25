import axios from 'axios';

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
        responseType: 'arraybuffer'  // Changed from 'stream' to 'arraybuffer'
      });

      console.log('Successfully fetched audio file');
      console.log('Content-Length:', response.headers['content-length']);
      console.log('Content-Type:', response.headers['content-type']);

      const sanitizedTitle = sanitizeFilename(title || 'audio');

      // Set the appropriate headers for file download
      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mp4');
      res.setHeader('Content-Length', response.headers['content-length']);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.m4a"`);

      // Send the entire audio file as a buffer
      res.send(Buffer.from(response.data, 'binary'));

      console.log('Audio file sent successfully');
    } catch (error) {
      console.error('Error downloading audio:', error.message);
      if (error.response) {
        console.error('Error response:', error.response.status, error.response.data);
      }
      res.status(500).json({ error: 'An error occurred while downloading the audio', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}