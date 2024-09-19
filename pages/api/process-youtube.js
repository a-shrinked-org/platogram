import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      const client = axios.create();
      const response = await client.post(
        "https://mango.sievedata.com/v2/push",
        {
          function: "damn/youtube_audio_extractor",
          inputs: {
            url: youtubeUrl,
            resolution: "lowest-available",
            include_audio: true
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4",
          }
        }
      );

      // Return the response from the API
      return res.status(200).json(response.data);
    } catch (error) {
      console.error('Error processing YouTube URL:', error);
      return res.status(500).json({ error: 'An error occurred while processing the YouTube URL' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}