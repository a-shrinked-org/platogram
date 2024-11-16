import axios from 'axios';
import { Cookie } from 'tough-cookie';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { url, title, start, end, useChunks } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Enhanced browser-like headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'Sec-Fetch-Dest': 'audio',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Connection': 'keep-alive',
      'Cookie': 'CONSENT=YES+cb; VISITOR_INFO1_LIVE=true'
    };

    if (useChunks === 'true' && start !== undefined && end !== undefined) {
      headers.Range = `bytes=${start}-${end}`;
    }

    try {
      console.log(`Starting download attempt for: ${url}`);

      // First, try to get video info
      const infoResponse = await axios.get(url, {
        headers: {
          ...headers,
          'Range': undefined
        },
        maxRedirects: 5,
        validateStatus: null
      });

      console.log('Info response status:', infoResponse.status);

      if (infoResponse.headers['set-cookie']) {
        const cookies = infoResponse.headers['set-cookie'].map(Cookie.parse);
        headers.Cookie = cookies.map(c => `${c.key}=${c.value}`).join('; ');
      }

      // Now try the actual download
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
        maxBodyLength: Infinity,
        decompress: true
      };

      const response = await axios(axiosConfig);

      // Set response headers
      const contentType = response.headers['content-type'] ||
        (url.includes('webm') ? 'audio/webm' : 'audio/mp4');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');

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

      // Detailed error response
      if (!res.headersSent) {
        res.status(500).json({
          error: 'An error occurred while downloading the audio',
          details: error.message,
          url: url,
          useChunks: useChunks,
          range: useChunks === 'true' ? `${start}-${end}` : 'none',
          errorCode: error.code,
          errorResponse: error.response?.data,
          errorStatus: error.response?.status
        });
      }
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};