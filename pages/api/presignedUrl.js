// presignedUrl.js - Server endpoint
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function POST(req) {
  try {
    const { filename, contentType } = await req.json();

    if (!filename) {
      return new Response(JSON.stringify({
        error: 'Filename is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const key = `${Date.now()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600 // URL expires in 1 hour
    });

    return new Response(JSON.stringify({
      url: presignedUrl,
      key: key
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate upload URL'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}