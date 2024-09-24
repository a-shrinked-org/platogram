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

// Add this function to ensure HTTPS
function ensureHttps(url) {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  if (!url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

export default async function handler(req, res) {
  // Run the middleware
  await runMiddleware(req, res, cors);

   if (req.method === 'POST') {
    try {
      const { price, lang, email } = req.body;  // Add email to the destructured properties

      // Ensure HTTPS for the base URL
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://shrinked.ai'
        : 'https://platogram.vercel.app';

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,  // Add this line to include the customer's email
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Content Conversion',
              },
              unit_amount: Math.round(price * 100), // Stripe expects amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
        cancel_url: `${baseUrl}/cancel`,
      });

      res.status(200).json({ id: session.id });
    } catch (err) {
      console.error('Error creating checkout session:', err);
      res.status(500).json({ statusCode: 500, message: err.message });
    }
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}