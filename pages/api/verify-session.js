// File: pages/api/create-checkout-session.js

import Stripe from 'stripe';
import Cors from 'cors';

// Initialize the cors middleware
const cors = Cors({
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
});

// Helper method to wait for a middleware to execute before continuing
// And to throw an error when an error happens in a middleware
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    const { session_id, isTestMode } = req.body;

    try {
        if (isTestMode) {
            // For test mode, just return success
            return res.status(200).json({ status: 'success' });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            res.status(200).json({ status: 'success' });
        } else {
            res.status(400).json({ status: 'failure', message: 'Payment not completed' });
        }
    } catch (error) {
        console.error('Error verifying Stripe session:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
}