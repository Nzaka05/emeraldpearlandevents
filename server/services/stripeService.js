// STRIPE DISABLED — Paystack is the active payment gateway
// To re-enable: uncomment the route in server.js and the button in eventDetail.ejs
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Creates a Stripe Checkout Session for a booking
 * @param {Object} params
 * @param {Object} params.booking - Mongoose Booking document
 * @param {string} params.currency - 'KES' or 'USD'
 * @param {string} params.successUrl - Redirect URL on successful payment
 * @param {string} params.cancelUrl - Redirect URL on cancelled payment
 * @returns {Promise<Object>} Stripe Checkout Session object
 */
exports.createCheckoutSession = async ({ booking, currency, successUrl, cancelUrl }) => {
  const amountInSmallestUnit = Math.round(booking.estimatedTotal * 100);
  
  const customerIdStr = booking.customerId
    ? (booking.customerId._id ? booking.customerId._id.toString() : booking.customerId.toString())
    : '';

  return await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        product_data: {
          name: `Emerald Pearland — ${booking.eventType}`,
          description: `Booking reference: ${booking.bookingReference || booking._id}`,
        },
        unit_amount: amountInSmallestUnit,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      bookingId: booking._id.toString(),
      customerId: customerIdStr,
    },
  });
};
