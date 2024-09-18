const crypto = require('crypto');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const secretKey = process.env.INTERCOM_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Intercom secret key is not set' });
  }

  const hash = crypto.createHmac('sha256', secretKey).update(email).digest('hex');
  res.status(200).json({ hash });
}