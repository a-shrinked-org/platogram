import axios from 'axios';

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
  const maxAttempts = 30; // Adjust as needed

  while ((status === 'queued' || status === 'processing') && attempts < maxAttempts) {
    const jobData = await getJobStatus(jobId);
    status = jobData.status;

    if (status === 'finished') {
      return jobData.outputs;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds before polling again
  }

  throw new Error(`Job failed or timed out with status: ${status}`);
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

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error processing YouTube URL:', error);
      return res.status(500).json({ error: 'An error occurred while processing the YouTube URL', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}