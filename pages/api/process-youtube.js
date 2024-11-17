import axios from 'axios';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
    externalResolver: true,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      console.log(`Processing YouTube URL: ${youtubeUrl}`);

      // Call Sieve API
      const response = await axios.post(
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

      // Get the result URL directly
      const jobId = response.data.id;
      const result = await pollForResult(jobId);

      return res.status(200).json(result);
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

async function pollForResult(jobId) {
  const maxAttempts = 30;
  const pollInterval = 2000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await axios.get(`${SIEVE_API_URL}/jobs/${jobId}`, {
      headers: {
        "X-API-Key": SIEVE_API_KEY,
      }
    });

    if (response.data.status === 'finished') {
      return response.data.outputs;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Processing timeout');
}