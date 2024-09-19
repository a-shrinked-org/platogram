import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { url, title } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      const response = await axios.get(url, {
        responseType: 'stream'
      });

      // Set the appropriate headers for file download
      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${title || 'audio'}.m4a"`);

      // Pipe the audio stream to the response
      response.data.pipe(res);
    } catch (error) {
      console.error('Error downloading audio:', error);
      res.status(500).json({ error: 'An error occurred while downloading the audio' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}