const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const { price, lang } = JSON.parse(req.body);

      // Ensure price is a valid integer (Stripe expects amount in cents)
      const amount = Math.round(parseFloat(price) * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Content Conversion',
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
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
};