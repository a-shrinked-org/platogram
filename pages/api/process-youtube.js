import axios from 'axios';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

// Configure axios instance with reasonable defaults
const axiosInstance = axios.create({
  timeout: 30000, // 30 second timeout
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": SIEVE_API_KEY,
  }
});

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
    externalResolver: true,
  },
};

async function submitSieveJob(url) {
  try {
    const response = await axiosInstance.post(`${SIEVE_API_URL}/push`, {
      function: "damn/youtube_to_audio",
      inputs: { url }
    });

    if (!response.data || !response.data.id) {
      throw new Error('Invalid response from Sieve API');
    }

    return response.data;
  } catch (error) {
    console.error('Error submitting job to Sieve:', error);
    throw new Error(`Failed to submit job: ${error.message}`);
  }
}

async function checkJobStatus(jobId) {
  try {
    const response = await axiosInstance.get(`${SIEVE_API_URL}/jobs/${jobId}`);
    return response.data;
  } catch (error) {
    console.error('Error checking job status:', error);
    throw new Error(`Failed to check job status: ${error.message}`);
  }
}

async function processYouTubeUrl(url) {
  const job = await submitSieveJob(url);
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes maximum wait time with 5-second intervals

  while (attempts < maxAttempts) {
    const status = await checkJobStatus(job.id);

    if (status.status === 'finished') {
      return {
        status: 'success',
        data: status.outputs[0]
      };
    }

    if (status.status === 'failed') {
      throw new Error('Job processing failed');
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
    attempts++;
  }

  throw new Error('Job timed out');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { youtubeUrl } = req.body;

    if (!youtubeUrl) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Validate YouTube URL format
    const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
    if (!urlPattern.test(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL format' });
    }

    console.log(`Processing YouTube URL: ${youtubeUrl}`);

    const result = await processYouTubeUrl(youtubeUrl);

    if (!result.data || !result.data.audio_url) {
      throw new Error('No audio URL in response');
    }

    // Return the processed result
    return res.status(200).json([{
      status: 'success',
      data: {
        audio_url: result.data.audio_url,
        title: result.data.title || 'youtube_audio',
        duration: result.data.duration || 0
      }
    }]);

  } catch (error) {
    console.error('Error processing YouTube URL:', error);

    // Handle different types of errors appropriately
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    return res.status(500).json({
      error: 'Failed to process YouTube URL',
      details: error.message
    });
  }
}