import axios from 'axios';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

// Configure axios instance with better timeout handling
const axiosInstance = axios.create({
    timeout: 60000, // Increase timeout to 60 seconds
    headers: {
        "Content-Type": "application/json",
        "X-API-Key": SIEVE_API_KEY,
    },
    maxRedirects: 5,
    validateStatus: status => status < 500 // Treat only 500+ as errors
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
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('Connection to Sieve API timed out');
            }
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded with Sieve API');
            }
        }
        throw error;
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
    const maxAttempts = 12; // Reduce max attempts to 1 minute total (5s intervals)
    const retryDelay = 5000; // 5 seconds between attempts

    while (attempts < maxAttempts) {
        try {
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

            await new Promise(resolve => setTimeout(resolve, retryDelay));
            attempts++;
        } catch (error) {
            if (attempts === maxAttempts - 1) {
                throw error; // Only throw on last attempt
            }
            // On other attempts, log and continue
            console.error(`Attempt ${attempts + 1} failed:`, error);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            attempts++;
        }
    }

    throw new Error('Job processing timed out');
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

        const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
        if (!urlPattern.test(youtubeUrl)) {
            return res.status(400).json({ error: 'Invalid YouTube URL format' });
        }

        console.log(`Processing YouTube URL: ${youtubeUrl}`);

        const result = await processYouTubeUrl(youtubeUrl);

        if (!result.data || !result.data.audio_url) {
            throw new Error('No audio URL in response');
        }

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

        // Better error handling with specific status codes
        if (error.message.includes('timed out')) {
            return res.status(504).json({
                error: 'Processing timed out',
                details: 'The request took too long to process. Please try again with a shorter video.'
            });
        }

        if (error.message.includes('Rate limit')) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                details: 'Please try again in a few minutes.'
            });
        }

        return res.status(500).json({
            error: 'Failed to process YouTube URL',
            details: error.message
        });
    }
}