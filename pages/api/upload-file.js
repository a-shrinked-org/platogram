import { handleUpload, put, del } from '@vercel/blob';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'];

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle chunked upload
      const form = new IncomingForm();

      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('Parsing form error:', err);
          return res.status(500).json({ error: 'File upload failed during parsing' });
        }

        const chunk = files.file[0];
        const { totalChunks, chunkIndex, fileName } = fields;

        try {
          console.log(`Processing chunk ${chunkIndex} of ${totalChunks} for file ${fileName}`);
          const chunkContent = await fs.promises.readFile(chunk.filepath);

          // Ensure fileName is a string
          const safeFileName = String(fileName);

          if (chunkIndex === '0') {
            const blob = await put(safeFileName, chunkContent, {
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
            await put(safeFileName, chunkContent, {
              access: 'public',
              addRandomSuffix: false,
              multipart: {
                uploadId: fields.uploadId,
                partNumber: parseInt(chunkIndex) + 1,
              },
            });

            if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
              const finalBlob = await put(safeFileName, Buffer.from([]), {
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
          return res.status(500).json({ error: 'Chunk upload failed', details: error.message });
        }
      });
    } else {
      // Handle direct upload
      try {
        const body = await req.json();
        const jsonResponse = await handleUpload({
          body,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            // Authenticate user and check permissions here
            return {
              allowedContentTypes: ['audio/*', 'video/*'],
              tokenPayload: JSON.stringify({
                // Add any custom payload here
              }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            console.log('Upload completed', blob, tokenPayload);
            // You could update a database here if needed
          },
        });
        return res.status(200).json(jsonResponse);
      } catch (error) {
        console.error('Error in blob upload:', error);
        return res.status(400).json({ error: error.message });
      }
    }
  } else if (req.method === 'DELETE') {
    try {
      const { fileUrl } = req.body;

      if (!fileUrl) {
        return res.status(400).json({ error: 'File URL is required' });
      }

      const url = new URL(fileUrl);
      const pathname = url.pathname.split('/').pop(); // Get the filename

      await del(pathname);

      console.log('File deleted successfully:', pathname);
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}