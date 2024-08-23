import { vercel_handler } from './main';

export default async function (req, res) {
  try {
    const mockRequest = {
      method: 'GET',
      url: { path: '/api/cron' },
      headers: req.headers,
      body: null
    };

    const result = await vercel_handler(mockRequest);

    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('Error in cron job:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}