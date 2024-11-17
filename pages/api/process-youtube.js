import axios from 'axios';

const SIEVE_API_KEY = "B6s3PV-pbYz52uK9s-0dIC9LfMU09RoCwRokiGjjPq4";
const SIEVE_API_URL = "https://mango.sievedata.com/v2";

const jobCache = new Map();

const axiosInstance = axios.create({
    timeout: 60000,
    headers: {
        "Content-Type": "application/json",
        "X-API-Key": SIEVE_API_KEY,
    },
    maxRedirects: 5,
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
        console.log('Submitting job to Sieve:', url);
        const response = await axiosInstance.post(`${SIEVE_API_URL}/push`, {
            function: "damn/youtube_to_audio",
            inputs: { url }
        });

        if (!response.data || !response.data.id) {
            throw new Error('Invalid response from Sieve API');
        }

        // Store initial job status in cache
        jobCache.set(response.data.id, {
            status: 'processing',
            timestamp: Date.now()
        });

        console.log('Job submitted successfully:', response.data.id);
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
        console.log('Checking job status:', jobId);
        // Check cache first
        const cachedJob = jobCache.get(jobId);
        if (cachedJob && cachedJob.status === 'finished') {
            console.log('Found finished job in cache');
            return {
                status: 'finished',
                outputs: [cachedJob.data]
            };
        }

        const response = await axiosInstance.get(`${SIEVE_API_URL}/jobs/${jobId}`);
        console.log('Job status response:', response.data);

        // Update cache if job is finished
        if (response.data.status === 'finished' && response.data.outputs && response.data.outputs[0]) {
            jobCache.set(jobId, {
                status: 'finished',
                data: response.data.outputs[0],
                timestamp: Date.now()
            });
        }

        return response.data;
    } catch (error) {
        console.error('Error checking job status:', error);
        throw new Error(`Failed to check job status: ${error.message}`);
    }
}

// Cache cleanup
setInterval(() => {
    const now = Date.now();
    for (const [jobId, job] of jobCache.entries()) {
        if (now - job.timestamp > 3600000) {
            jobCache.delete(jobId);
        }
    }
}, 300000);

export default async function handler(req, res) {
    // Handle status check requests
    if (req.method === 'GET' && req.query.jobId) {
        try {
            const status = await checkJobStatus(req.query.jobId);
            console.log('Status check result:', status);

            // Modified status response to match frontend expectations
            if (status.status === 'finished' && status.outputs) {
                return res.status(200).json({
                    status: 'finished',
                    data: {
                        audio_url: status.outputs[0].audio_url,
                        title: status.outputs[0].title || 'youtube_audio'
                    }
                });
            }

            return res.status(200).json({
                status: status.status,
                data: null
            });
        } catch (error) {
            console.error('Status check error:', error);
            return res.status(500).json({
                error: 'Failed to check job status',
                details: error.message
            });
        }
    }

    // Handle new job submissions
    if (req.method === 'POST') {
        try {
            const { youtubeUrl } = req.body;
            console.log('Received YouTube URL:', youtubeUrl);

            if (!youtubeUrl) {
                return res.status(400).json({ error: 'YouTube URL is required' });
            }

            const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
            if (!urlPattern.test(youtubeUrl)) {
                return res.status(400).json({ error: 'Invalid YouTube URL format' });
            }

            const job = await submitSieveJob(youtubeUrl);
            console.log('Job created successfully:', job.id);

            // Changed response format to match frontend expectations
            return res.status(200).json({
                status: 'processing',
                data: {
                    jobId: job.id
                }
            });
        } catch (error) {
            console.error('Error processing YouTube URL:', error);

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

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}