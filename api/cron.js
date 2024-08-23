import { handler } from '../main';

export default async function (req, res) {
  const event = {
    httpMethod: 'GET',
    path: '/api/cron',
    headers: req.headers,
    body: null,
  };

  const result = await handler(event, {});

  res.status(result.statusCode).json(JSON.parse(result.body));
}