import { handleUpload } from '@vercel/blob';
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

async function deleteBlob(url) {
  try {
    const { del } = await import('@vercel/blob');
    await del(url);
    console.log('Deleted Blob:', url);
  } catch (error) {
    console.error('Error deleting Blob:', url, error);
  }
}

export default async function handler(req, res) {
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);

  if (req.method === 'POST') {
    try {
      // Check if this is a token request
      const isTokenRequest = req.headers['x-vercel-blob-token-request'] === 'true';

      if (isTokenRequest) {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          console.error('BLOB_READ_WRITE_TOKEN not found in environment variables');
          return res.status(500).json({ error: 'Server configuration error' });
        }
        return res.status(200).json({ token: process.env.BLOB_READ_WRITE_TOKEN });
      }

      // Handle file upload request
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        console.log('Handling file upload');
        const response = await handleUpload({
          body: req,
          request: req,
          onBeforeGenerateToken: async () => ({
            allowedContentTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a'],
          }),
        });
        return res.status(200).json(response);
      }

      // Handle merge request
      if (req.headers['content-type'] === 'application/json') {
        const body = await new Promise((resolve) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({});
            }
          });
        });

        const { audioUrls } = body;
        if (!audioUrls || !Array.isArray(audioUrls) || audioUrls.length < 2) {
          return res.status(400).json({ error: 'At least two audio URLs are required' });
        }

        // Create temporary directory
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audio-merge-'));
        const inputFiles = [];
        const outputFile = path.join(tempDir, 'merged.m4a');

        try {
          // Download and process files
          for (let i = 0; i < audioUrls.length; i++) {
            const inputFile = path.join(tempDir, `input${i}.m4a`);
            await downloadFile(audioUrls[i], inputFile);
            inputFiles.push(inputFile);
          }

          // Merge audio files
          await mergeAudioFiles(inputFiles, outputFile);

          // Upload merged file to Vercel Blob
          const mergedFileData = await fs.promises.readFile(outputFile);
          const { url } = await handleUpload({
            body: mergedFileData,
            request: {
              headers: {
                'content-type': 'audio/mp4',
              },
            },
            onBeforeGenerateToken: async () => ({
              allowedContentTypes: ['audio/mp4'],
            }),
          });

          // Clean up source files in Blob storage
          console.log('Cleaning up source files from Blob storage');
          for (const sourceUrl of audioUrls) {
            if (sourceUrl.includes('.public.blob.vercel-storage.com')) {
              await deleteBlob(sourceUrl);
            }
          }

          return res.status(200).json({ url });
        } finally {
          // Clean up local temporary files
          console.log('Cleaning up local temporary files');
          for (const file of inputFiles) {
            try {
              await fs.promises.unlink(file);
            } catch (error) {
              console.error('Error deleting temp file:', file, error);
            }
          }
          try {
            if (fs.existsSync(outputFile)) {
              await fs.promises.unlink(outputFile);
            }
            await fs.promises.rmdir(tempDir);
          } catch (error) {
            console.error('Error cleaning up temp directory:', error);
          }
        }
      }

      return res.status(400).json({ error: 'Invalid request' });

    } catch (error) {
      console.error('Error in handler:', error);
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({});
          }
        });
      });

      const { url } = body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required for deletion' });
      }

      await deleteBlob(url);
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