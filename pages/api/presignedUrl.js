// pages/api/presignedUrl.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Edge Runtime config
export const config = {
  runtime: 'edge'
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

async function generatePresignedUrl(filename, contentType) {
    if (!filename) {
        throw new Error('Filename is required');
    }

    const key = `${Date.now()}-${filename}`;
    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType || 'audio/webm',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { url: presignedUrl, key };
}

export default async function handler(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: corsHeaders,
            status: 204,
        });
    }

    try {
        let filename, contentType;

        if (request.method === 'GET') {
            const url = new URL(request.url);
            filename = url.searchParams.get('filename');
            contentType = url.searchParams.get('contentType') || 'audio/webm';

            console.log('GET request params:', { filename, contentType });
        }
        else if (request.method === 'POST') {
            const contentTypeHeader = request.headers.get('content-type');

            if (contentTypeHeader?.includes('application/json')) {
                const body = await request.json();
                filename = body.filename;
                contentType = body.contentType;
            } else {
                const formData = await request.formData();
                filename = formData.get('filename');
                contentType = formData.get('contentType');
            }

            console.log('POST request data:', { filename, contentType });
        }

        if (!filename) {
            throw new Error('Filename is required');
        }

        const result = await generatePresignedUrl(filename, contentType);

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    } catch (error) {
        console.error('API Error:', error);

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