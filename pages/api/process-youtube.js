import axios from 'axios';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

async function pollJobStatus(jobId) {
  let status = 'queued';
  while (status === 'queued' || status === 'running') {
    const response = await axios.get(`${SIEVE_API_URL}/jobs/${jobId}`, {
      headers: {
        "X-API-Key": SIEVE_API_KEY,
      },
    });
    status = response.data.status;
    if (status === 'completed') {
      return response.data.outputs;
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds before polling again
  }
  throw new Error(`Job failed with status: ${status}`);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

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

      const jobId = response.data.id;
      const result = await pollJobStatus(jobId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error processing YouTube URL:', error);
      return res.status(500).json({ error: 'An error occurred while processing the YouTube URL' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}