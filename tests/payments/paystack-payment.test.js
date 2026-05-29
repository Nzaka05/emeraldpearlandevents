require('dotenv').config();
const mongoose = require('mongoose');

// Mock built-in https module before importing the service
jest.mock('https', () => {
  return {
    request: jest.fn().mockImplementation((options, callback) => {
      const req = {
        write: jest.fn(),
        end: jest.fn().mockImplementation(() => {
          // Simulate response
          const res = new (require('events').EventEmitter)();
          res.statusCode = 200;
          
          let responseData = { status: true, message: 'Success', data: {} };
          if (options.path.includes('/transaction/initialize')) {
            responseData.data = {
              authorization_url: 'https://checkout.paystack.com/pay/mock_ref_123',
              access_code: 'mock_code_123',
              reference: 'mock_ref_123'
            };
          } else if (options.path.includes('/transaction/verify')) {
            responseData.data = {
              status: 'success',
              amount: 15000000,
              reference: 'mock_ref_123',
              gateway_response: 'Successful',
              paid_at: new Date().toISOString()
            };
          }

          callback(res);
          res.emit('data', JSON.stringify(responseData));
          res.emit('end');
        }),
        on: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn()
      };
      return req;
    })
  };
});

const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const { initializeTransaction, verifyTransaction } = require('../../server/services/paystackService');

describe('Paystack Payment Service', () => {
  let customer;
  let booking;

  beforeEach(async () => {
    // Setup test customer
    customer = await Customer.create({
      name: 'Paystack Test Client',
      email: 'paystacktest@example.com',
      phone: '254700000000',
      status: 'active'
    });

    // Setup test booking
    booking = await Booking.create({
      customerId: customer._id,
      eventType: 'Wedding',
      eventDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      eventDuration: '6 hours',
      location: 'Emerald Gardens, Nairobi',
      guests: 150,
      budgetRange: 'KES 250,000 – 500,000',
      estimatedTotal: 300000,
      paymentMethod: 'pending'
    });
  });

  afterEach(async () => {
    await Booking.deleteMany({ customerId: customer._id });
    await Customer.deleteOne({ _id: customer._id });
  });

  it('should successfully initialize a Paystack transaction', async () => {
    // Populate booking.customerId as paystackService expects it
    const populatedBooking = await Booking.findById(booking._id).populate('customerId');

    const data = await initializeTransaction({
      booking: populatedBooking,
      currency: 'KES',
      callbackUrl: 'http://localhost/callback'
    });

    expect(data.authorization_url).toBe('https://checkout.paystack.com/pay/mock_ref_123');
    expect(data.access_code).toBe('mock_code_123');
    expect(data.reference).toBe('mock_ref_123');
  });

  it('should successfully verify a Paystack transaction', async () => {
    const data = await verifyTransaction('mock_ref_123');

    expect(data.status).toBe('success');
    expect(data.amount).toBe(15000000);
    expect(data.reference).toBe('mock_ref_123');
  });

  it('should allow Booking schema to store paystackReference and paymentMethod paystack', async () => {
    booking.paymentMethod = 'paystack';
    booking.paystackReference = 'mock_ref_123';
    await booking.save();

    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking.paymentMethod).toBe('paystack');
    expect(freshBooking.paystackReference).toBe('mock_ref_123');
  });
});
