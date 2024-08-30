// File: app/api/create-checkout-session/route.js

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // Use the latest API version
});

export async function POST(request) {
  try {
    const { price, lang } = await request.json();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
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
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
    });

    return Response.json({ id: session.id });
  } catch (err) {
    return Response.json({ statusCode: 500, message: err.message }, { status: 500 });
  }
}