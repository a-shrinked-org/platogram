import axios from 'axios';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

// Create axios instance with increased timeout
const axiosInstance = axios.create({
  timeout: 300000 // 5 minutes
});

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
    externalResolver: true,
  },
};

async function submitJob(youtubeUrl) {
  const response = await axiosInstance.post(
    `${SIEVE_API_URL}/push`,
    {
      function: "damn/youtube_to_audio",
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
    headers: {
      "X-API-Key": SIEVE_API_KEY,
    }
  });
  return response.data;
}

async function pollJobStatus(jobId) {
  let status = 'queued';
  let attempts = 0;
  const maxAttempts = 150; // 5 minutes with 2-second intervals
  const pollInterval = 2000;

  while ((status === 'queued' || status === 'processing') && attempts < maxAttempts) {
    const jobData = await getJobStatus(jobId);
    status = jobData.status;
    console.log(`Job ${jobId} status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

    if (status === 'finished') {
      return jobData.outputs[0];  // Return first output directly
    }

    if (status === 'failed') {
      throw new Error(`Job failed with status: ${status}`);
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job timed out after ${maxAttempts} attempts`);
}

export default async function handler(req, res) {
  // Set a longer timeout for the response
  res.setTimeout(300000); // 5 minutes

  if (req.method === 'POST') {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      console.log(`Processing YouTube URL: ${youtubeUrl}`);

      // Submit job and get ID
      const jobId = await submitJob(youtubeUrl);
      console.log(`Job submitted with ID: ${jobId}`);

      // Poll for results
      const result = await pollJobStatus(jobId);
      console.log('Job completed successfully');

      // Return the Sieve URL directly
      return res.status(200).json({
        url: result.url,
        _path: result._path
      });

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