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
        responseType: 'stream'
      });

      console.log('Successfully fetched audio stream');

      const sanitizedTitle = sanitizeFilename(title || 'audio');

      // Set the appropriate headers for file download
      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.m4a"`);

      // Pipe the audio stream to the response
      response.data.pipe(res);

      // Handle the end of the stream
      response.data.on('end', () => {
        console.log('Audio stream sent successfully');
      });
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