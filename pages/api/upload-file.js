import { handleUpload, del } from '@vercel/blob/client';

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const jsonResponse = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          // Authenticate user and check permissions here
          // You can add your authentication logic here
          return {
            allowedContentTypes: ['audio/*', 'video/*'],
            tokenPayload: JSON.stringify({
              // Add any custom payload here, like user ID
              userId: 'example-user-id',
            }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          // Handle successful upload here
          console.log('Upload completed', blob);
          const { userId } = JSON.parse(tokenPayload);
          console.log('User ID:', userId);
          // You could update a database here if needed
        },
      });
      return res.status(200).json(jsonResponse);
    } catch (error) {
      console.error('Error in blob upload:', error);
      return res.status(400).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { fileUrl } = req.body;

      if (!fileUrl) {
        return res.status(400).json({ error: 'File URL is required' });
      }

      const url = new URL(fileUrl);
      const pathname = url.pathname.split('/').pop(); // Get the filename

      await del(pathname);

      console.log('File deleted successfully:', pathname);
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}