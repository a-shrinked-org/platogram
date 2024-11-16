import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import axios from 'axios';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, method = 'ytdl' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    if (method === 'ytdl') {
      console.log(`Starting yt-dlp download for: ${url}`);

      const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio',     // Best audio format
        '-x',                  // Extract audio
        '--audio-format', 'mp3', // Convert to mp3
        '--audio-quality', '0',  // Best quality
        '-o', '-',             // Output to stdout
        url                    // Video URL
      ]);

      ytdlp.stderr.on('data', (data) => {
        console.error(`yt-dlp error: ${data}`);
      });

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');

      ytdlp.stdout.pipe(res);

      ytdlp.on('close', (code) => {
        if (code !== 0) {
          console.error(`yt-dlp process exited with code ${code}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
          }
        }
        console.log('Download completed successfully');
      });
    } else {
      // Handle Sieve download
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/'
        }
      });

      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/webm');
      response.data.pipe(res);
    }
  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  }
}