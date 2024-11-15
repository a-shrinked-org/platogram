import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { url, title, start, end, useChunks } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    // Add Range header for chunked downloads
    if (useChunks === 'true' && start !== undefined && end !== undefined) {
      headers.Range = `bytes=${start}-${end}`;
    }

    try {
      console.log(`Starting download: ${useChunks === 'true' ? 'chunked' : 'direct'} for URL: ${url}`);

      const response = await axios({
        method: 'get',
        url: url,
        responseType: useChunks === 'true' ? 'arraybuffer' : 'stream',
        headers: headers,
        validateStatus: function (status) {
          return status >= 200 && status < 300 || status === 206; // Accept partial content status
        }
      });

      // Set appropriate headers based on the content type from the response
      const contentType = response.headers['content-type'] ||
        (url.includes('webm') ? 'audio/webm' : 'audio/mp4');
      res.setHeader('Content-Type', contentType);

      if (useChunks === 'true') {
        // For chunked downloads, include range headers
        res.setHeader('Content-Range', response.headers['content-range']);
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(206); // Partial Content
        res.send(Buffer.from(response.data, 'binary'));
        console.log(`Chunk sent successfully: ${start}-${end}`);
      } else {
        // For direct downloads, pipe the stream
        console.log('Starting direct download stream');
        response.data.pipe(res);

        // Handle completion and errors for the stream
        response.data.on('end', () => {
          console.log('Direct download completed successfully');
        });

        response.data.on('error', (error) => {
          console.error('Stream error:', error);
          // The response might already be partially sent, so we can only log the error
        });
      }
    } catch (error) {
      console.error('Error downloading audio:', error.message);

      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          error: 'An error occurred while downloading the audio',
          details: error.message,
          url: url,
          useChunks: useChunks,
          range: useChunks === 'true' ? `${start}-${end}` : 'none'
        });
      }
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}