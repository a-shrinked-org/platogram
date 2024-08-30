import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const form = new formidable.IncomingForm();
    form.uploadDir = path.join(process.cwd(), 'public', 'uploads');
    form.keepExtensions = true;

    form.parse(req, (err, fields, files) => {
      if (err) {
        res.status(500).json({ error: 'File upload failed' });
        return;
      }

      const file = files.file;
      const newFilename = `${Date.now()}_${file.newFilename}`;
      const newPath = path.join(form.uploadDir, newFilename);

      fs.renameSync(file.filepath, newPath);

      const fileUrl = `${req.headers.origin}/uploads/${newFilename}`;

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