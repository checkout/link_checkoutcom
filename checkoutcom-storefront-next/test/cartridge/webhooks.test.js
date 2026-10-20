'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { load, makeContainer, customObjects, orderManager, ORDER } = require('./helpers/sfcc');

const KEY = 'psk_test';

/** dw.crypto fakes backed by node:crypto. */
const crypt = {
    'dw/crypto/Mac': class {
        static get HMAC_SHA_256() {
            return 'sha256';
        }

        digest(body, key) {
            return crypto.createHmac('sha256', key).update(body).digest();
        }
    },
    'dw/crypto/Encoding': { toHex: (bytes) => Buffer.from(bytes).toString('hex') },
};

/** Custom objects with pay_1 bound to the given order. */
function boundTo(order) {
    const objects = customObjects();
    const binding = objects.createCustomObject('ckoPayment', 'pay_1');

    binding.custom.orderNo = order.getOrderNo();
    binding.custom.orderToken = order.getOrderToken();

    return objects;
}

function webhooks(extra = {}) {
    return load('scripts/checkoutcom/webhooks', {
        preferences: { ckoMode: 'sandbox', ckoPrivateSharedKey: KEY },
        ...crypt,
        ...extra,
    });
}

test('accepts a valid Cko-Signature and rejects a tampered body', () => {
    const body = '{"id":"evt_1","type":"payment_captured"}';
    const signature = crypto.createHmac('sha256', KEY).update(body).digest('hex');
    const service = webhooks();

    assert.equal(service.isAuthentic(body, signature, null), true);
    assert.equal(service.isAuthentic(body.replace('captured', 'refunded'), signature, null), false);
});

test('accepts the shared key in the Authorization header, rejects anything else', () => {
    const service = webhooks();

    assert.equal(service.isAuthentic('{}', null, KEY), true);
    assert.equal(service.isAuthentic('{}', null, 'wrong'), false);
    assert.equal(service.isAuthentic('{}', null, null), false);
});

test('a capture webhook appends a capture and marks the order paid', () => {
    const order = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });
    const service = webhooks({ 'dw/order/OrderMgr': orderManager({ '00001': order }), 'dw/object/CustomObjectMgr': boundTo(order) });

    order.instruments[0].getPaymentTransaction().custom.ckoTransactionType = 'Authorization';
    order.instruments[0].getPaymentTransaction().custom.ckoTransactionOpened = true;

    service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1', reference: '00001', amount: 4500, currency: 'GBP' } });

    assert.equal(order.instruments.length, 2);
    assert.equal(order.instruments[1].getPaymentTransaction().custom.ckoTransactionType, 'Capture');
    assert.equal(order.instruments[0].getPaymentTransaction().custom.ckoTransactionOpened, false);
    assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_PAID);
});

test('a full refund closes the capture and leaves the order unpaid', () => {
    const order = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });
    const service = webhooks({ 'dw/order/OrderMgr': orderManager({ '00001': order }), 'dw/object/CustomObjectMgr': boundTo(order) });

    service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1', reference: '00001', amount: 4500, currency: 'GBP' } });
    service.handleEvent({ id: 'evt_2', type: 'payment_refunded', data: { id: 'pay_1', reference: '00001', amount: 4500, currency: 'GBP' } });

    const capture = order.instruments.find((i) => i.getPaymentTransaction().custom.ckoTransactionType === 'Capture');

    assert.equal(capture.getPaymentTransaction().custom.ckoTransactionOpened, false);
    assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_NOTPAID);
});

test('a declined webhook fails an order still waiting for payment', () => {
    const order = makeContainer({ orderNo: '00001' });
    const failed = [];
    const service = webhooks({
        'dw/order/OrderMgr': orderManager({ '00001': order }, { failOrder: (o) => failed.push(o.getOrderNo()) }),
        'dw/object/CustomObjectMgr': boundTo(order),
    });

    service.handleEvent({ id: 'evt_1', type: 'payment_declined', data: { id: 'pay_1', reference: '00001' } });

    assert.deepEqual(failed, ['00001']);
});

test('an event without an order is acknowledged without changes', () => {
    const service = webhooks({ 'dw/order/OrderMgr': orderManager({}), 'dw/object/CustomObjectMgr': customObjects() });

    assert.doesNotThrow(() => service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_x', reference: 'nope' } }));
});

test('webhooks reach an order only through its binding: the order number alone is not enough', () => {
    const order = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });
    const service = webhooks({ 'dw/order/OrderMgr': orderManager({ '00001': order }), 'dw/object/CustomObjectMgr': customObjects() });

    service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1', reference: '00001', amount: 4500, currency: 'GBP' } });

    assert.equal(order.instruments.length, 1);
    assert.deepEqual(order.notes, []);
});

test('auto captured payment: the payment_captured webhook completes the capture recorded at placement instead of adding one', () => {
    const ledgerOrder = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });
    const ledger = load('scripts/checkoutcom/ledger');

    ledger.recordPayment(ledgerOrder, { id: 'pay_1', status: 'Captured', amount: 4500, currency: 'GBP' });

    const service = webhooks({ 'dw/order/OrderMgr': orderManager({ '00001': ledgerOrder }), 'dw/object/CustomObjectMgr': boundTo(ledgerOrder) });

    service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1', action_id: 'act_1', reference: '00001', amount: 4500, currency: 'GBP' } });

    const captures = ledgerOrder.instruments.filter((i) => i.getPaymentTransaction().custom.ckoTransactionType === 'Capture');

    assert.equal(captures.length, 1);
    assert.equal(captures[0].getPaymentTransaction().custom.ckoActionId, 'act_1');
    assert.equal(captures[0].getPaymentTransaction().getAmount().getValue(), 45);
});

test('an action already in the ledger is not recorded again (repeated delivery under a new event id)', () => {
    const order = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });
    const service = webhooks({ 'dw/order/OrderMgr': orderManager({ '00001': order }), 'dw/object/CustomObjectMgr': boundTo(order) });
    const refund = { id: 'pay_1', action_id: 'act_r1', reference: '00001', amount: 1000, currency: 'GBP' };

    service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1', action_id: 'act_c1', reference: '00001', amount: 4500, currency: 'GBP' } });
    service.handleEvent({ id: 'evt_2', type: 'payment_refunded', data: refund });
    service.handleEvent({ id: 'evt_3', type: 'payment_refunded', data: refund });

    const types = order.instruments.map((i) => i.getPaymentTransaction().custom.ckoTransactionType).filter(Boolean);

    assert.deepEqual(types.filter((t) => t === 'Capture').length, 1);
    assert.deepEqual(types.filter((t) => t === 'Refund').length, 1);
});

test('race: the capture webhook arrives before completion; completion does not add a second capture', () => {
    const order = makeContainer({ orderNo: '00001' });
    const service = webhooks({ 'dw/order/OrderMgr': orderManager({ '00001': order }), 'dw/object/CustomObjectMgr': boundTo(order) });

    // 1. webhook first: the order is bound (at submission) but not completed yet
    service.handleEvent({ id: 'evt_1', type: 'payment_captured', data: { id: 'pay_1', action_id: 'act_1', reference: '00001', amount: 4500, currency: 'GBP' } });

    // 2. then completion, with the payment already Captured
    load('scripts/checkoutcom/ledger').recordPayment(order, { id: 'pay_1', status: 'Captured', amount: 4500, currency: 'GBP' });

    const transactions = order.instruments.map((i) => i.getPaymentTransaction());
    const captures = transactions.filter((t) => t.custom.ckoTransactionType === 'Capture');
    const authorization = transactions.find((t) => t.custom.ckoTransactionType === 'Authorization');

    assert.equal(captures.length, 1);
    assert.equal(captures[0].custom.ckoActionId, 'act_1');
    assert.equal(authorization.custom.ckoTransactionOpened, false);
    assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_PAID);
});

test('completion removes an empty duplicate payment instrument copied from the basket', () => {
    const order = makeContainer({ orderNo: '00001', instruments: 2 });

    load('scripts/checkoutcom/ledger').recordPayment(order, { id: 'pay_1', status: 'Authorized', amount: 4500, currency: 'GBP' });

    assert.equal(order.instruments.length, 1);
    assert.equal(order.instruments[0].getPaymentTransaction().getTransactionID(), 'pay_1');
});
