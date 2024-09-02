// api/upload-file.js
import { put } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'];

    if (contentType.startsWith('application/json')) {
      // This is a request for a client-side upload token
      try {
        const result = await handleUpload({
          body: req.body,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            // You can add additional checks here
            return {
              allowedContentTypes: ['audio/*', 'video/*'],
              maximumSizeInBytes: 100 * 1024 * 1024, // 100MB for example
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            console.log('Upload completed', blob);
            // You can update your database here
          },
        });

        return res.status(200).json(result);
      } catch (error) {
        console.error('Error handling client upload:', error);
        return res.status(500).json({ error: 'Failed to handle client upload' });
      }
    } else {
      // This is a small file upload (< 4MB)
      try {
        const { filename, contentType } = req.body;
        const file = req.body.file; // Assuming the file is sent in the request body

        const blob = await put(filename, file, {
          contentType,
          access: 'public',
        });

        return res.status(200).json(blob);
      } catch (error) {
        console.error('Error uploading file:', error);
        return res.status(500).json({ error: 'Failed to upload file' });
      }
    }
  } else if (req.method === 'DELETE') {
  } else {
    res.setHeader('Allow', ['POST', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}