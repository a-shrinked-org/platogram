import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { authorization } = req.headers;

  if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  try {
    // Call your Python function to process tasks
    const { exec } = require('child_process');
    exec('python3 -c "from main import process_tasks; import asyncio; asyncio.run(process_tasks())"', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return res.status(500).end('Error processing tasks');
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
      res.status(200).end('Tasks processed successfully');
    });
  } catch (error) {
    console.error('Error processing tasks:', error);
    res.status(500).end('Error processing tasks');
  }
}