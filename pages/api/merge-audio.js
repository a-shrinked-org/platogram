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

//async function handleFileUpload(req) {
//  try {
//    // Read the file data
//    const chunks = [];
//   for await (const chunk of req) {
//      chunks.push(chunk);
//    }
//    const buffer = Buffer.concat(chunks);
//
//    // Get boundary from content type
//    const boundary = '--' + req.headers['content-type']
//      .split('boundary=')[1]
//     .trim();
//
//    // Split the buffer into parts using the boundary
//   const parts = buffer.toString().split(boundary);
//
//    // Find the file part
//    const filePart = parts.find(part =>
//     part.includes('Content-Disposition') &&
//     part.includes('filename=')
//   );
//
//   if (!filePart) {
//      throw new Error('No file found in upload');
//    }
//
//    // Parse file information
//    const filenameMatch = filePart.match(/filename="([^"]+)"/);
//    const contentTypeMatch = filePart.match(/Content-Type:\s*([^\r\n]+)/i);
//
//   if (!filenameMatch) {
//      throw new Error('Filename not found');
//   }
//
//    const filename = filenameMatch[1];
//   const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
//
//    // Extract file content
//    const fileContentStart = filePart.indexOf('\r\n\r\n') + 4;
//   const fileContentEnd = filePart.lastIndexOf('\r\n');
//   const fileContent = filePart.substring(fileContentStart, fileContentEnd);
//
//    // Convert to buffer
//   const fileBuffer = Buffer.from(fileContent, 'binary');
//
//   console.log('Uploading file:', {
//     filename,
//      contentType,
//      size: fileBuffer.length
//   });
//
//   // Upload to Vercel Blob
//   const blob = await put(filename, fileBuffer, {
//     access: 'public',
//     token: process.env.BLOB_READ_WRITE_TOKEN,
//     addRandomSuffix: true,
//     contentType: contentType
//   });
//
//   console.log('Upload successful:', blob.url);
//   return blob;
//  } catch (error) {
//   console.error('File upload error:', error);
//   throw error;
// }
//}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Token request handling
      if (req.headers['x-vercel-blob-token-request'] === 'true') {
        console.log('Token request received');
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return res.status(500).json({ error: 'Server configuration error' });
        }
        return res.status(200).json({ token: process.env.BLOB_READ_WRITE_TOKEN });
      }

      // File upload handling
      if (req.headers['content-type']?.includes('multipart/form-data')) {
  try {
    const boundaryRegex = /boundary=(?:"([^"]+)"|([^;]+))/i;
    const match = req.headers['content-type'].match(boundaryRegex);
    const boundary = match[1] || match[2];

    if (!boundary) {
      throw new Error('No boundary in Content-Type header');
    }

    console.log('Handling file upload, content type:', req.headers['content-type'], 'Boundary:', boundary);

      // Read the file data
          const buffer = Buffer.concat(await collectChunks(req));

          // Split the buffer into parts using the boundary
          const parts = buffer.toString().split('--' + boundary);

          const blobs = []; // Array to collect blob information

          for (let part of parts) {
            if (part.trim() === '' || !part.includes('Content-Disposition')) {
              continue; // Skip empty parts or non-file parts
            }

            // Extract filename and content type for each file part
            const filenameMatch = part.match(/filename="((?:[^"]|\\")*)"/);
            const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);

      if (filenameMatch) {
        let filename = filenameMatch[1]
          .replace(/\\"/g, '"') // Remove escaped quotes
          .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace all non-alphanumeric characters with underscore
          .replace(/^_+|_+$/g, '')  // Remove underscores at the beginning or end
          .replace(/__+/g, '_');  // Replace multiple underscores with one

        // Ensure filename is not too long
        if (filename.length > 100) {
          filename = filename.slice(0, 97) + '_' + filename.slice(-3); // Keep last three chars for uniqueness
        }

        // Append .m4a if not present, as an example
        if (!filename.toLowerCase().endsWith('.m4a')) {
          filename += '.m4a'; // Assuming M4A files, change if necessary
        }

        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'audio/mpeg'; // Default to audio/mpeg if not specified

        // Extract file content
        const contentStart = part.indexOf('\r\n\r\n') + 4;
        const contentEnd = part.lastIndexOf('\r\n');
        const fileContent = part.substring(contentStart, contentEnd);

        // Convert to buffer
        const fileBuffer = Buffer.from(fileContent, 'binary');

        console.log('Uploading file:', {
          filename,
          contentType,
          size: fileBuffer.length
        });

        // Upload to Vercel Blob
        const blob = await put(filename, fileBuffer, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
          addRandomSuffix: true,
          contentType: contentType
        });

        console.log('Upload successful:', blob.url);
        blobs.push(blob); // Add the blob to the array
      }
    }

    if (blobs.length > 0) {
      return res.status(200).json(blobs); // Return all blobs
    } else {
      throw new Error('No files were successfully uploaded');
    }
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(400).json({
      error: error.message,
      details: {
        contentType: req.headers['content-type'],
        errorType: error.name,
        errorStack: error.stack
      }
    });
  }
}

      async function collectChunks(req) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        return chunks;
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

          // Upload merged file with token
          const sanitizedFilename = 'merged-audio_' + Date.now() + '.m4a'; // Adding timestamp for uniqueness
          const mergedFileData = await fs.promises.readFile(outputFile);

          const blob = await put(sanitizedFilename, mergedFileData, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            addRandomSuffix: true,
            contentType: 'audio/mpeg' // Changed from 'audio/mp4' to 'audio/mpeg' for M4A files
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

      // If we reach here, it's an invalid request
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