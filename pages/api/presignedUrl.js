// presignedUrl.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Consider restricting this to your extension ID
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
};

const logger = {
    info: (...args) => {
        console.log(new Date().toISOString(), '[INFO]', ...args);
    },
    error: (...args) => {
        console.error(new Date().toISOString(), '[ERROR]', ...args);
    },
    debug: (...args) => {
        if (process.env.DEBUG) {
            console.log(new Date().toISOString(), '[DEBUG]', ...args);
        }
    }
};

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

async function generatePresignedUrl(filename, contentType) {
    if (!filename) {
        throw new Error('Filename is required');
    }

    const key = `${Date.now()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType || 'audio/webm',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600 // URL expires in 1 hour
    });

    return {
        url: presignedUrl,
        key: key
    };
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
    return new Response(null, {
        headers: corsHeaders,
        status: 204,
    });
}

// Handle GET request
export async function GET(req) {
    try {
        // Get parameters from URL
        const url = new URL(req.url);
        const filename = url.searchParams.get('filename');
        const contentType = url.searchParams.get('contentType') || 'audio/webm';

        const result = await generatePresignedUrl(filename, contentType);

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        return new Response(JSON.stringify({
            error: error.message || 'Failed to generate upload URL'
        }), {
            status: error.message.includes('required') ? 400 : 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }
}

// Handle POST request
export async function POST(req) {
    try {
        logger.info('Received POST request');

        let filename, contentType;
        try {
            const body = await req.json();
            logger.debug('Request body:', body);
            filename = body.filename;
            contentType = body.contentType;
        } catch (e) {
            logger.debug('JSON parse failed, trying formData');
            const formData = await req.formData();
            filename = formData.get('filename');
            contentType = formData.get('contentType');
        }

        logger.info('Generating presigned URL for:', { filename, contentType });
        const result = await generatePresignedUrl(filename, contentType);
        logger.info('Generated presigned URL successfully');

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    } catch (error) {
        logger.error('Error handling request:', error);
        return new Response(JSON.stringify({
            error: error.message || 'Failed to generate upload URL'
        }), {
            status: error.message.includes('required') ? 400 : 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }
}