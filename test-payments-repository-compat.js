const assert = require('assert');

const Payment = require('./server/models/ClientPayment');
const repository = require('./modules/payments/payments.repository');

const originalFind = Payment.find;
const originalCountDocuments = Payment.countDocuments;

function makeQueryChain(items) {
  return {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return Promise.resolve(items); }
  };
}

(async () => {
  const fakeItems = [
    { _id: 'p1', amount: 1200 },
    { _id: 'p2', amount: 900 }
  ];

  try {
    Payment.find = () => makeQueryChain(fakeItems);
    Payment.countDocuments = async () => 42;

    const objectShape = await repository.findAll({ page: 2, limit: 10, payment_status: 'completed' });
    const positionalShape = await repository.findAll({ payment_status: 'completed' }, 2, 10);

    for (const result of [objectShape, positionalShape]) {
      assert.ok(Array.isArray(result.items), 'result.items must be an array');
      assert.ok(Array.isArray(result.payments), 'result.payments must be an array');
      assert.ok(result.pagination && typeof result.pagination === 'object', 'result.pagination must exist');

      assert.strictEqual(result.items.length, fakeItems.length, 'items length mismatch');
      assert.strictEqual(result.payments.length, fakeItems.length, 'payments length mismatch');
      assert.strictEqual(result.total, 42, 'total mismatch');
      assert.strictEqual(result.page, 2, 'page mismatch');
      assert.strictEqual(result.limit, 10, 'limit mismatch');
      assert.strictEqual(result.pages, 5, 'pages mismatch');

      assert.strictEqual(result.pagination.currentPage, 2, 'pagination.currentPage mismatch');
      assert.strictEqual(result.pagination.page, 2, 'pagination.page mismatch');
      assert.strictEqual(result.pagination.limit, 10, 'pagination.limit mismatch');
      assert.strictEqual(result.pagination.total, 42, 'pagination.total mismatch');
      assert.strictEqual(result.pagination.pages, 5, 'pagination.pages mismatch');
    }

    console.log('PASS: payments.repository.findAll supports both signatures and both return shapes.');
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    Payment.find = originalFind;
    Payment.countDocuments = originalCountDocuments;
  }
})();
