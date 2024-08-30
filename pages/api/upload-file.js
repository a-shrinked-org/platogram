import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const form = new IncomingForm({
      uploadDir: path.join(process.cwd(), 'public', 'uploads'),
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('File upload error:', err);
        res.status(500).json({ error: 'File upload failed' });
        return;
      }

      const file = files.file[0];  // In newer versions, this might be an array
      const newFilename = `${Date.now()}_${file.originalFilename}`;
      const newPath = path.join(form.uploadDir, newFilename);

      fs.renameSync(file.filepath, newPath);

      const fileUrl = `${req.headers.origin}/uploads/${newFilename}`;

      console.log('File uploaded successfully:', fileUrl);
      res.status(200).json({ 
        message: 'File uploaded successfully',
        fileUrl: fileUrl
      });
    });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}