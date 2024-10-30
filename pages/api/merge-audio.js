import { handleUpload } from '@vercel/blob';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const execAsync = promisify(exec);

const client = jwksClient({
  jwksUri: `https://dev-w0dm4z23pib7oeui.us.auth0.com/.well-known/jwks.json`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    var signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: 'https://platogram.vercel.app/',
      issuer: `https://dev-w0dm4z23pib7oeui.us.auth0.com/`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

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
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);

  if (req.method === 'POST') {
    try {
      // Extract the token from the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
      }
      const token = authHeader.split(' ')[1];

      // Verify the Auth0 token
      let decoded;
      try {
        decoded = await verifyToken(token);
        console.log('Auth successful', decoded);
      } catch (error) {
        console.log('Auth error:', error);
        throw new Error('Unauthorized');
      }

      // Check if this is a token request or an upload request
      const isTokenRequest = req.headers['x-vercel-blob-token-request'] === 'true';

      if (isTokenRequest) {
        // Return the Blob token for client-side uploads
        console.log('Returning Blob token for client-side upload');
        return res.status(200).json({ token: process.env.BLOB_READ_WRITE_TOKEN });
      }

      // Handle file upload request
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        console.log('Handling file upload');
        const response = await handleUpload({
          body: req,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            console.log('onBeforeGenerateToken called');
            return {
              allowedContentTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a'],
              tokenPayload: JSON.stringify({
                userId: decoded.sub,
              }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            console.log('Upload completed:', blob, tokenPayload);
            try {
              const { userId } = JSON.parse(tokenPayload);
              // Add additional logic here if needed
            } catch (error) {
              console.error('Error in onUploadCompleted:', error);
              throw new Error('Could not process completed upload');
            }
          },
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

      // Create temporary directory and process files
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audio-merge-'));
      const inputFiles = [];
      const outputFile = path.join(tempDir, 'merged.m4a');

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

      // Clean up
      for (const file of inputFiles) {
        await fs.promises.unlink(file);
      }
      await fs.promises.unlink(outputFile);
      await fs.promises.rmdir(tempDir);

      return res.status(200).json({ url });
    } catch (error) {
      console.error('Error in upload handler:', error);
      return res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}