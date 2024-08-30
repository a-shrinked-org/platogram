import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  const body = await req.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Authenticate user and check permissions here
        return {
          allowedContentTypes: ['audio/*', 'video/*'],
          tokenPayload: JSON.stringify({
            // Add any custom payload here
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Handle successful upload here
        console.log('Upload completed', blob, tokenPayload);
        // You could update a database here if needed
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Error in blob upload:', error);
    return res.status(400).json({ error: error.message });
  }
}