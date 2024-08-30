// pages/api/trigger-processing.js
import { Pool } from 'pg';
import { promisify } from 'util';
import { writeFile } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const writeFileAsync = promisify(writeFile);

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { fileId, lang, price, payload } = req.body;

    try {
      let finalPayload;

      if (fileId) {
        const client = await pool.connect();
        try {
          // Check if file is completely uploaded
          const result = await client.query(
            'SELECT * FROM completed_files WHERE file_id = $1',
            [fileId]
          );

          if (result.rows.length === 0) {
            res.status(400).json({ error: 'File not completely uploaded' });
            return;
          }

          // Retrieve all chunks
          const chunksResult = await client.query(
            'SELECT chunk_data FROM file_chunks WHERE file_id = $1 ORDER BY chunk_index',
            [fileId]
          );

          // Combine chunks
          const completeFile = Buffer.concat(chunksResult.rows.map(row => Buffer.from(row.chunk_data, 'base64')));

          // Write to a temporary file
          const tempFilePath = path.join('/tmp', `platogram_uploads_${uuidv4()}`);
          await writeFileAsync(tempFilePath, completeFile);
          finalPayload = `file://${tempFilePath}`;

        } finally {
          client.release();
        }
      } else {
        // For URL inputs
        finalPayload = payload;
      }

      // Send to backend for processing
      const backendResponse = await fetch('https://temporary.name/convert', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${req.headers.authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          payload: finalPayload,
          lang,
          price: price.toString(),
        }),
      });

      if (!backendResponse.ok) {
        throw new Error('Backend processing failed');
      }

      // Clean up the database if it was a file upload
      if (fileId) {
        const client = await pool.connect();
        try {
          await client.query('DELETE FROM file_chunks WHERE file_id = $1', [fileId]);
          await client.query('DELETE FROM completed_files WHERE file_id = $1', [fileId]);
        } finally {
          client.release();
        }
      }

      res.status(200).json({ message: 'Processing started' });
    } catch (error) {
      console.error('Error triggering processing:', error);
      res.status(500).json({ error: 'Failed to trigger processing' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}