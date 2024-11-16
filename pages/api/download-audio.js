import { createReadStream } from 'fs';
import path from 'path';

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

  const { file } = req.query;

  if (!file) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    // Set headers for file download
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`);

    // Create read stream from the file
    const fileStream = createReadStream(file);

    // Pipe the file to response
    fileStream.pipe(res);

    // Handle errors
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file', details: error.message });
      }
    });

  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  }
}