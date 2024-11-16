import axios from 'axios';
import ytdl from 'ytdl-core';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

const axiosInstance = axios.create({
  timeout: 120000 // 2 minutes
});

// Existing Sieve functions
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
  const maxAttempts = 60;
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

// New function to get direct audio URL using ytdl-core
async function getDirectAudioUrl(youtubeUrl) {
  try {
    const info = await ytdl.getInfo(youtubeUrl);

    // Get the best audio format
    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });

    if (!audioFormat) {
      throw new Error('No audio format found');
    }

    return {
      url: audioFormat.url,
      title: info.videoDetails.title,
      format: audioFormat.container,
      quality: audioFormat.audioQuality,
      contentLength: audioFormat.contentLength,
    };
  } catch (error) {
    console.error('Error getting direct audio URL:', error);
    return null;
  }
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

      // Try ytdl-core first
      const directAudio = await getDirectAudioUrl(youtubeUrl);

      if (directAudio) {
        return res.status(200).json([{
          type: "str",
          data: {
            title: directAudio.title,
            audio_url: directAudio.url,
            ext: directAudio.format,
            format: `${directAudio.quality} - audio only`,
            acodec: "opus"
          }
        }]);
      }

      // Fall back to Sieve if ytdl-core fails
      console.log('Falling back to Sieve API');
      const jobId = await submitJob(youtubeUrl);
      console.log(`Job submitted with ID: ${jobId}`);

      let processingStartTime = Date.now();
      const result = await pollJobStatus(jobId);
      const processingTime = (Date.now() - processingStartTime) / 1000;
      console.log(`Job completed in ${processingTime} seconds`);

      const parsedResult = result.map(output => {
        if (output.type === 'str' && output.data) {
          try {
            const parsedData = JSON.parse(output.data);
            return {
              ...output,
              data: parsedData
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