import axios from 'axios';
import ytdl from 'ytdl-core';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

const axiosInstance = axios.create({
  timeout: 30000
});

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
      const { youtubeUrl, mode = 'sieve' } = req.body;  // Add mode parameter

      if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      console.log(`Processing YouTube URL: ${youtubeUrl} in ${mode} mode`);

      // Direct ytdl mode for manual testing
      if (mode === 'direct') {
        const info = await ytdl.getInfo(youtubeUrl);
        const audioFormat = ytdl.chooseFormat(info.formats, {
          quality: 'highestaudio',
          filter: 'audioonly',
        });

        if (!audioFormat) {
          throw new Error('No suitable audio format found');
        }

        return res.status(200).json([{
          type: "str",
          data: {
            title: info.videoDetails.title,
            audio_url: audioFormat.url,
            ext: audioFormat.container,
            filesize: audioFormat.contentLength,
            format: "bestaudio - audio only",
            acodec: audioFormat.audioCodec
          }
        }]);
      }

      // Default Sieve mode for the main app
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

      return res.status(200).json({
        jobId: response.data.id,
        status: 'processing'
      });

    } catch (error) {
      console.error('Error processing YouTube URL:', error);
      return res.status(500).json({
        error: 'An error occurred while processing the YouTube URL',
        details: error.message
      });
    }
  } else if (req.method === 'GET') {
    // Handle status check (unchanged)
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
      const response = await axiosInstance.get(`${SIEVE_API_URL}/jobs/${jobId}`, {
        headers: {
          "X-API-Key": SIEVE_API_KEY,
        }
      });

      const status = response.data.status;

      if (status === 'finished') {
        return res.status(200).json({
          status: 'finished',
          result: response.data.outputs[0]
        });
      } else if (status === 'failed') {
        return res.status(500).json({
          status: 'failed',
          error: 'Job processing failed'
        });
      } else {
        return res.status(200).json({
          status: status,
          progress: response.data.progress || 0
        });
      }
    } catch (error) {
      console.error('Error checking status:', error);
      return res.status(500).json({
        error: 'An error occurred while checking job status',
        details: error.message
      });
    }
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}