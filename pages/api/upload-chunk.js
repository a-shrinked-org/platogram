// pages/api/upload-chunk.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { fileId, chunkIndex, chunk, totalChunks } = req.body;

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Store the chunk
        await client.query(
          'INSERT INTO file_chunks (file_id, chunk_index, chunk_data) VALUES ($1, $2, $3)',
          [fileId, chunkIndex, chunk]
        );

        // Check if all chunks are uploaded
        const result = await client.query(
          'SELECT COUNT(*) FROM file_chunks WHERE file_id = $1',
          [fileId]
        );

        if (parseInt(result.rows[0].count) === totalChunks) {
          // All chunks uploaded, mark file as complete
          await client.query(
            'INSERT INTO completed_files (file_id, total_chunks) VALUES ($1, $2)',
            [fileId, totalChunks]
          );
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Chunk uploaded successfully' });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error uploading chunk:', error);
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}