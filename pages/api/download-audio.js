import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { url, title, start, end } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Received download request for: ${url}, start: ${start}, end: ${end}`);

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
        headers: { Range: `bytes=${start}-${end}` }
      });

      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mp4');
      res.setHeader('Content-Range', response.headers['content-range']);
      res.setHeader('Accept-Ranges', 'bytes');
      res.status(206); // Partial Content

      res.send(Buffer.from(response.data, 'binary'));

      console.log(`Chunk sent successfully: ${start}-${end}`);
    } catch (error) {
      console.error('Error downloading audio chunk:', error.message);
      res.status(500).json({ error: 'An error occurred while downloading the audio chunk', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}