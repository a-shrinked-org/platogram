// pages/api/trigger-processing.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { fileId, lang, price } = req.body;

    try {
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
        const completeFile = chunksResult.rows.map(row => Buffer.from(row.chunk_data, 'base64')).join('');

        // Send to backend for processing
        const backendResponse = await fetch('https://temporary.name/convert', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${req.headers.authorization}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payload: completeFile.toString('base64'),
            lang,
            price,
          }),
        });

        if (!backendResponse.ok) {
          throw new Error('Backend processing failed');
        }

        // Clean up the database
        await client.query('DELETE FROM file_chunks WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM completed_files WHERE file_id = $1', [fileId]);

        res.status(200).json({ message: 'Processing started' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error triggering processing:', error);
      res.status(500).json({ error: 'Failed to trigger processing' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}