import { handleUpload, list, del } from '@vercel/blob';
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
      // Handle file upload request
      if (req.headers['content-type']?.includes('multipart/form-data')) {
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
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(JSON.parse(data)));
      });

      const { audioUrls } = body;
      if (!audioUrls || !Array.isArray(audioUrls) || audioUrls.length < 2) {
        return res.status(400).json({ error: 'At least two audio URLs are required' });
      }

      // Create temporary directory
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audio-merge-'));
      const inputFiles = [];
      const outputFile = path.join(tempDir, 'merged.m4a');

      // Download all files
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

      // Clean up temporary files
      for (const file of inputFiles) {
        await fs.promises.unlink(file);
      }
      await fs.promises.unlink(outputFile);
      await fs.promises.rmdir(tempDir);

      return res.status(200).json({ url });
    } catch (error) {
      console.error('Error processing audio merge:', error);
      return res.status(500).json({ error: 'An error occurred while merging audio files' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}