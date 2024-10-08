import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

async function submitJob(youtubeUrl) {
  const response = await axios.post(
    `${SIEVE_API_URL}/push`,
    {
      function: "damn/youtube_audio_extractor",
      inputs: {
        url: youtubeUrl,
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": SIEVE_API_KEY,
      }
    }
  );
  return response.data.id;
}

async function getJobStatus(jobId) {
  const response = await axios.get(`${SIEVE_API_URL}/jobs/${jobId}`, {
    headers: {
      "X-API-Key": SIEVE_API_KEY,
    },
  });
  return response.data;
}

async function pollJobStatus(jobId) {
  let status = 'queued';
  let attempts = 0;
  const maxAttempts = 30;

  while ((status === 'queued' || status === 'processing') && attempts < maxAttempts) {
    const jobData = await getJobStatus(jobId);
    status = jobData.status;

    if (status === 'finished') {
      return jobData.outputs;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`Job failed or timed out with status: ${status}`);
}

async function downloadAudio(url) {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'arraybuffer'
  });
  return Buffer.from(response.data, 'binary');
}

function trimSilence(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, 'input.m4a');
    const outputPath = path.join(tempDir, 'output.m4a');

    fs.writeFileSync(inputPath, inputBuffer);

    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-af', 'silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-50dB',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const trimmedBuffer = fs.readFileSync(outputPath);
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        resolve(trimmedBuffer);
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });

    ffmpeg.stderr.on('data', (data) => {
      console.error(`FFmpeg stderr: ${data}`);
    });
  });
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      console.log(`Processing YouTube URL: ${youtubeUrl}`);

      const jobId = await submitJob(youtubeUrl);
      console.log(`Job submitted with ID: ${jobId}`);

      const result = await pollJobStatus(jobId);
      console.log(`Job completed. Result:`, result);

      const parsedResult = await Promise.all(result.map(async (output) => {
        if (output.type === 'str' && output.data) {
          try {
            const parsedData = JSON.parse(output.data);
            if (parsedData.audio_url) {
              console.log(`Downloading audio from: ${parsedData.audio_url}`);
              const audioBuffer = await downloadAudio(parsedData.audio_url);
              console.log('Trimming silence...');
              const trimmedBuffer = await trimSilence(audioBuffer);

              // Here, you would typically upload the trimmed buffer to a storage service
              // and update the audio_url. For this example, we'll just log the new size.
              console.log(`Original size: ${audioBuffer.length}, Trimmed size: ${trimmedBuffer.length}`);

              return {
                ...output,
                data: {
                  ...parsedData,
                  trimmed_size: trimmedBuffer.length
                }
              };
            }
            return { ...output, data: parsedData };
          } catch (error) {
            console.error('Error parsing output data:', error);
            return output;
          }
        }
        return output;
      }));

            return res.status(200).json(parsedResult);
          } catch (error) {
            console.error('Error processing YouTube URL:', error);
            return res.status(500).json({ error: 'An error occurred while processing the YouTube URL', details: error.message });
          }
        } else {
          res.setHeader('Allow', ['POST']);
          res.status(405).end(`Method ${req.method} Not Allowed`);
        }
      }