import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { url, title, start, end, useChunks } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Enhanced headers to mimic browser request
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'Sec-Fetch-Dest': 'audio',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Connection': 'keep-alive'
    };

    // Add Range header for chunked downloads
    if (useChunks === 'true' && start !== undefined && end !== undefined) {
      headers.Range = `bytes=${start}-${end}`;
    }

    try {
      console.log(`Starting download: ${useChunks === 'true' ? 'chunked' : 'direct'} for URL: ${url}`);

      const axiosConfig = {
        method: 'get',
        url: url,
        headers: headers,
        responseType: useChunks === 'true' ? 'arraybuffer' : 'stream',
        maxRedirects: 5,
        timeout: 30000,
        validateStatus: function (status) {
          return status >= 200 && status < 300 || status === 206;
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      };

      const response = await axios(axiosConfig);

      // Set response headers
      const contentType = response.headers['content-type'] ||
        (url.includes('webm') ? 'audio/webm' : 'audio/mp4');
      res.setHeader('Content-Type', contentType);

      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }

      if (useChunks === 'true') {
        if (response.headers['content-range']) {
          res.setHeader('Content-Range', response.headers['content-range']);
        }
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(206);
        res.send(Buffer.from(response.data, 'binary'));
        console.log(`Chunk sent successfully: ${start}-${end}`);
      } else {
        console.log('Starting direct download stream');

        // Set additional headers for streaming
        res.setHeader('Transfer-Encoding', 'chunked');

        response.data.pipe(res);

        response.data.on('end', () => {
          console.log('Direct download completed successfully');
        });

        response.data.on('error', (error) => {
          console.error('Stream error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error occurred' });
          }
        });
      }
    } catch (error) {
      console.error('Error downloading audio:', error.message);
      console.error('Full error:', error);

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

// Configure the API route
export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};