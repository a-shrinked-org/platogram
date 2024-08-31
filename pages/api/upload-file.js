import { handleUpload, del, put } from '@vercel/blob';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Parsing form error:', err);
        return res.status(500).json({ error: 'File upload failed during parsing' });
      }

      const chunk = files.file[0];
      const { totalChunks, chunkIndex, fileName } = fields;

      try {
        const chunkContent = await fs.promises.readFile(chunk.filepath);

        // For the first chunk, start a new blob upload
        if (chunkIndex === '0') {
          const blob = await put(fileName, chunkContent, {
            access: 'public',
            addRandomSuffix: false,
            multipart: {
              chunks: parseInt(totalChunks),
            },
          });

          return res.status(200).json({
            message: 'Chunk uploaded successfully',
            fileUrl: blob.url,
            uploadId: blob.uploadId,
          });
        } else {
          // For subsequent chunks, append to the existing blob
          await put(fileName, chunkContent, {
            access: 'public',
            addRandomSuffix: false,
            multipart: {
              uploadId: fields.uploadId,
              partNumber: parseInt(chunkIndex) + 1,
            },
          });

          // If this is the last chunk, complete the multipart upload
          if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
            const finalBlob = await put(fileName, Buffer.from([]), {
              access: 'public',
              addRandomSuffix: false,
              multipart: {
                uploadId: fields.uploadId,
                isComplete: true,
              },
            });

            return res.status(200).json({
              message: 'File upload completed',
              fileUrl: finalBlob.url,
            });
          }

          return res.status(200).json({ message: 'Chunk uploaded successfully' });
        }
      } catch (error) {
        console.error('Vercel Blob upload error:', error);
        return res.status(500).json({ error: 'Chunk upload failed' });
      }
    });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}