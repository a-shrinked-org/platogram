import axios from 'axios';
import fs from 'fs';
import path from 'path';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

const axiosInstance = axios.create({
  timeout: 180000 // 3 minutes
});

async function submitJob(youtubeUrl) {
  const response = await axiosInstance.post(
    `${SIEVE_API_URL}/push`,
    {
      function: "damn/youtube_audio_extractor",
      inputs: { url: youtubeUrl }
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
  const response = await axiosInstance.get(`${SIEVE_API_URL}/jobs/${jobId}`, {
    headers: { "X-API-Key": SIEVE_API_KEY }
  });
  return response.data;
}

async function pollJobStatus(jobId) {
  let status = 'queued';
  let attempts = 0;
  const maxAttempts = 90; // Increased to 90 attempts (3 minutes)
  const pollInterval = 2000;

  while ((status === 'queued' || status === 'processing') && attempts < maxAttempts) {
    const jobData = await getJobStatus(jobId);
    status = jobData.status;
    console.log(`Job ${jobId} status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

    if (status === 'finished') {
      return jobData.outputs;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job failed or timed out with status: ${status} after ${attempts} attempts`);
}

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
    externalResolver: true,
  },
};

export default async function handler(req, res) {
  res.setTimeout(180000); // 3 minutes

  if (req.method === 'POST') {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      console.log(`Processing YouTube URL: ${youtubeUrl}`);

      // Process with Sieve
      const jobId = await submitJob(youtubeUrl);
      console.log(`Job submitted with ID: ${jobId}`);

      let processingStartTime = Date.now();
      const result = await pollJobStatus(jobId);
      const processingTime = (Date.now() - processingStartTime) / 1000;
      console.log(`Job completed in ${processingTime} seconds`);

      // Parse the result and prepare the file path
      const parsedResult = result.map(output => {
        if (output.type === 'str' && output.data) {
          try {
            const parsedData = JSON.parse(output.data);
            return {
              ...output,
              data: {
                ...parsedData,
                downloadUrl: `/api/download-audio?file=${encodeURIComponent(parsedData.file_path)}`
              }
            };
          } catch (error) {
            console.error('Error parsing output data:', error);
            return output;
          }
        }
        return output;
      });

      return res.status(200).json(parsedResult);
    } catch (error) {
      console.error('Error processing YouTube URL:', error);
      return res.status(500).json({
        error: 'An error occurred while processing the YouTube URL',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}