import { put, del } from '@vercel/blob';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(outputPath, Buffer.from(buffer));
}

async function mergeAudioFiles(inputFiles, outputFile) {
  const fileList = inputFiles.map(file => `file '${file}'`).join('\n');
  const listFile = path.join(os.tmpdir(), 'audiolist.txt');
  await fs.promises.writeFile(listFile, fileList);
  await execAsync(`ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}"`);
  await fs.promises.unlink(listFile);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Token request handling
      if (req.headers['x-vercel-blob-token-request'] === 'true') {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          console.error('BLOB_READ_WRITE_TOKEN not found in environment variables');
          return res.status(500).json({ error: 'Server configuration error' });
        }

        try {
          // Return the token with the key name expected by the client
          return res.status(200).json({
            token: process.env.BLOB_READ_WRITE_TOKEN // Changed from clientToken to token
          });
        } catch (error) {
          console.error('Error providing token:', error);
          return res.status(500).json({ error: 'Failed to provide upload token' });
        }
      }

      // Merge request handling
      if (req.headers['content-type'] === 'application/json') {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const { audioUrls } = JSON.parse(Buffer.concat(chunks).toString());

        if (!audioUrls?.length || audioUrls.length < 2) {
          return res.status(400).json({ error: 'At least two audio URLs are required' });
        }

        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audio-merge-'));
        const inputFiles = [];
        const outputFile = path.join(tempDir, 'merged.m4a');

        try {
          // Download files
          for (let i = 0; i < audioUrls.length; i++) {
            const inputFile = path.join(tempDir, `input${i}.m4a`);
            await downloadFile(audioUrls[i], inputFile);
            inputFiles.push(inputFile);
          }

          // Merge files
          await mergeAudioFiles(inputFiles, outputFile);

          // Upload merged file
          const mergedFileData = await fs.promises.readFile(outputFile);
          const blob = await put('merged-audio.m4a', mergedFileData, {
            access: 'public',
            addRandomSuffix: true,
            contentType: 'audio/mp4'
          });

          // Clean up source files
          for (const sourceUrl of audioUrls) {
            if (sourceUrl.includes('.public.blob.vercel-storage.com')) {
              await del(sourceUrl).catch(error => {
                console.error('Error deleting source file:', error);
              });
            }
          }

          return res.status(200).json({ url: blob.url });
        } finally {
          // Clean up temp files
          await Promise.all(inputFiles.map(file =>
            fs.promises.unlink(file).catch(console.error)
          ));
          if (fs.existsSync(outputFile)) {
            await fs.promises.unlink(outputFile).catch(console.error);
          }
          await fs.promises.rmdir(tempDir).catch(console.error);
        }
      }

      return res.status(400).json({ error: 'Invalid request' });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const { url } = JSON.parse(Buffer.concat(chunks).toString());

      if (!url) {
        return res.status(400).json({ error: 'URL is required for deletion' });
      }

      await del(url);
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}