require('dotenv').config();
const mongoose = require('mongoose');
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    return {
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({
            id: 'cs_test_mock_123',
            url: 'https://checkout.stripe.com/pay/cs_test_mock_123'
          })
        }
      },
      webhooks: {
        constructEvent: jest.fn().mockImplementation((body, sig, secret) => {
          return JSON.parse(body);
        })
      }
    };
  });
});

const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const { createCheckoutSession } = require('../../server/services/stripeService');

describe('Stripe Payment Integration', () => {
  let customer;
  let booking;

  beforeEach(async () => {
    // Setup test customer
    customer = await Customer.create({
      name: 'Stripe Test Client',
      email: 'stripetest@example.com',
      phone: '254700000000',
      status: 'active'
    });

    // Setup test booking
    booking = await Booking.create({
      customerId: customer._id,
      eventType: 'Corporate Event',
      eventDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      eventDuration: '4 hours',
      location: 'Stripe Hotel, Nairobi',
      guests: 50,
      budgetRange: 'KES 100,000 – 250,000',
      estimatedTotal: 150000
    });
  });

  afterEach(async () => {
    await Booking.deleteMany({ customerId: customer._id });
    await Customer.deleteOne({ _id: customer._id });
  });

  it('should successfully call Stripe to create a checkout session', async () => {
    const session = await createCheckoutSession({
      booking,
      currency: 'KES',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel'
    });

    expect(session.id).toBe('cs_test_mock_123');
    expect(session.url).toBe('https://checkout.stripe.com/pay/cs_test_mock_123');
  });

  it('should extend Booking schema with stripeSessionId, paymentMethod and paidAt', async () => {
    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking.stripeSessionId).toBeNull();
    expect(freshBooking.paymentMethod).toBe('pending');
    expect(freshBooking.paidAt).toBeNull();
  });
});
