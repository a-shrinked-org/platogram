const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      console.log('Received POST request for checkout session');
      const { price, lang } = JSON.parse(req.body);
      console.log('Price:', price, 'Lang:', lang);

      const amount = Math.round(parseFloat(price) * 100);
      console.log('Calculated amount:', amount);

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

      console.log('Checkout session created:', session.id);
      res.status(200).json({ id: session.id });
    } catch (err) {
      console.error('Error creating checkout session:', err);
      res.status(500).json({ statusCode: 500, message: err.message });
    }
  } else {
    console.log('Received non-POST request:', req.method);
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
};