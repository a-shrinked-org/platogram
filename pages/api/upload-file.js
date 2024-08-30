import { put } from '@vercel/blob';
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
        res.status(500).json({ error: 'File upload failed during parsing' });
        return;
      }

      const file = files.file[0];
      if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      try {
        const fileContent = await fs.promises.readFile(file.filepath);
        const blob = await put(file.originalFilename, fileContent, {
          access: 'public',
        });

        console.log('File uploaded successfully to Vercel Blob:', blob.url);
        res.status(200).json({
          message: 'File uploaded successfully',
          fileUrl: blob.url
        });
      } catch (error) {
        console.error('Vercel Blob upload error:', error);
        res.status(500).json({ error: 'File upload failed during Blob upload' });
      }
    });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}