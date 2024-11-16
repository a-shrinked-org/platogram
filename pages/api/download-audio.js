import { spawn } from 'child_process';
import { PassThrough } from 'stream';

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

  const { url, format = 'bestaudio' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    console.log(`Starting yt-dlp download for: ${url}`);

    // Create a pass-through stream to pipe the audio
    const passThrough = new PassThrough();

    // Spawn yt-dlp process
    const ytdlp = spawn('yt-dlp', [
      '-f', format,           // Format selection
      '-x',                   // Extract audio
      '--audio-format', 'mp3', // Convert to mp3
      '--audio-quality', '0',  // Best quality
      '-o', '-',              // Output to stdout
      url                     // Video URL
    ]);

    // Handle errors
    ytdlp.stderr.on('data', (data) => {
      console.error(`yt-dlp error: ${data}`);
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');

    // Pipe the output to response
    ytdlp.stdout.pipe(res);

    // Handle completion
    ytdlp.on('close', (code) => {
      if (code !== 0) {
        console.error(`yt-dlp process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      }
      console.log('Download completed successfully');
    });

  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  }
}