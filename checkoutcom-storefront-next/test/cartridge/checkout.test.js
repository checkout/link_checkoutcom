'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { load, makeContainer, makeScapiBasket, customObjects, orderManager, ORDER } = require('./helpers/sfcc');

const KEYS = {
    ckoMode: 'sandbox',
    ckoSecretKey: 'sk_sbox_test',
    ckoPublicKey: 'pk_sbox_test',
    ckoFlowAllowedReturnOrigins: 'https://shop.example, http://localhost:5173/',
};

let calls;
let objects;

beforeEach(() => {
    calls = { voids: [], refunds: [], failed: [], placed: [], submitted: [] };
    objects = customObjects();
    globalThis.customer = { getID: () => 'cust-1', isRegistered: () => false };
});

/** A gateway fake returning the given payment. */
function gateway(payment, extra = {}) {
    return {
        getPayment: () => ({ ok: true, object: payment }),
        voidPayment: (id) => { calls.voids.push(id); return { ok: true }; },
        refundPayment: (id) => { calls.refunds.push(id); return { ok: true }; },
        createPaymentSession: () => ({ ok: true, object: { id: 'ps_1', payment_session_secret: 'pss_1' } }),
        submitPaymentSession: (id, body) => { calls.submitted.push({ id, body }); return { ok: true, object: { id: 'pay_1', status: 'Approved' } }; },
        ...extra,
    };
}

/** An OrderMgr fake over a set of orders that records placements and failures. */
function orderMgr(ordersByNo, basketOrder) {
    return orderManager(ordersByNo, {
        placeOrder: (order) => { calls.placed.push(order.getOrderNo()); order.status = ORDER.ORDER_STATUS_NEW; return { isError: () => false }; },
        failOrder: (order) => { calls.failed.push(order.getOrderNo()); order.status = ORDER.ORDER_STATUS_FAILED; },
        createOrder: () => basketOrder,
    });
}

function checkout(payment, ordersByNo = {}, extra = {}) {
    return load('scripts/checkoutcom/checkout', {
        preferences: KEYS,
        'dw/order/OrderMgr': orderMgr(ordersByNo, extra.basketOrder),
        'dw/object/CustomObjectMgr': objects,
        '*/cartridge/scripts/checkoutcom/gateway': gateway(payment, extra.gateway),
    });
}

test('order-first: an approved payment places the order and records the authorization', () => {
    const order = makeContainer({ orderNo: '00001' });
    const result = checkout({ id: 'pay_1', status: 'Authorized', amount: 4500, currency: 'GBP', reference: '00001' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(result.status, 'complete');
    assert.equal(result.orderNo, '00001');
    assert.deepEqual(calls.placed, ['00001']);
    assert.equal(order.custom.ckoPaymentId, 'pay_1');
    assert.equal(order.instruments[0].getPaymentTransaction().custom.ckoTransactionType, 'Authorization');
    assert.deepEqual(objects.getCustomObject('ckoPayment', 'pay_1').custom, { orderNo: '00001', orderToken: 'token-00001' });
    assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_NOTPAID);
});

test('order-first: a captured payment also records the capture and marks the order paid', () => {
    const order = makeContainer({ orderNo: '00001' });

    checkout({ id: 'pay_1', status: 'Captured', amount: 4500, currency: 'GBP', reference: '00001' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(order.instruments.length, 2);
    assert.equal(order.instruments[1].getPaymentTransaction().custom.ckoTransactionType, 'Capture');
    assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_PAID);
});

test('order-first: a pending payment places the order unpaid and flags it', () => {
    const order = makeContainer({ orderNo: '00001' });
    const result = checkout({ id: 'pay_1', status: 'Pending', amount: 4500, currency: 'GBP', reference: '00001' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(result.status, 'complete');
    assert.equal(result.pending, true);
    assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_NOTPAID);
});

test('order-first: a declined payment fails the order (basket reopened) and is not reversed', () => {
    const order = makeContainer({ orderNo: '00001' });
    const result = checkout({ id: 'pay_1', status: 'Declined', amount: 4500, currency: 'GBP', reference: '00001' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(result.status, 'failed');
    assert.deepEqual(calls.failed, ['00001']);
    assert.deepEqual(calls.voids, []);
});

test('order-first: an amount mismatch fails the order and voids the payment', () => {
    const order = makeContainer({ orderNo: '00001' });
    const result = checkout({ id: 'pay_1', status: 'Authorized', amount: 100, currency: 'GBP', reference: '00001' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(result.status, 'failed');
    assert.deepEqual(calls.failed, ['00001']);
    assert.deepEqual(calls.voids, ['pay_1']);
});

test('order-first: a payment for another order number is rejected and reversed', () => {
    const order = makeContainer({ orderNo: '00001' });
    const result = checkout({ id: 'pay_1', status: 'Captured', amount: 4500, currency: 'GBP', reference: '00099' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(result.status, 'failed');
    assert.deepEqual(calls.refunds, ['pay_1']);
});

test('idempotent: completing a placed order again returns the same order', () => {
    const order = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });

    order.custom.ckoPaymentId = 'pay_1';

    const result = checkout({ id: 'pay_1', status: 'Captured', amount: 4500, currency: 'GBP', reference: '00001' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.equal(result.status, 'complete');
    assert.deepEqual(calls.placed, []);
});

test('security: another shopper\'s order is never completed', () => {
    const order = makeContainer({ orderNo: '00001', customerId: 'someone-else' });
    const result = checkout({ id: 'pay_1', status: 'Authorized', amount: 4500, currency: 'GBP', reference: 'bkt' }, { '00001': order })
        .completePayment({ paymentId: 'pay_1', orderNo: '00001' });

    assert.notEqual(result.status, 'complete');
    assert.deepEqual(calls.placed, []);
});

test('wallet fallback: a payment made for the basket is accepted for the order created from it', () => {
    const order = makeContainer({ orderNo: '00007' });
    const result = checkout(
        { id: 'pay_1', status: 'Authorized', amount: 4500, currency: 'GBP', reference: 'basket-1', metadata: { basket_id: 'basket-1' } },
        { '00007': order }
    ).completePayment({ paymentId: 'pay_1', orderNo: '00007', basketId: 'basket-1' });

    assert.equal(result.status, 'complete');
    assert.deepEqual(calls.placed, ['00007']);
});

test('wallet fallback: a payment made for another basket is rejected and reversed', () => {
    const order = makeContainer({ orderNo: '00007' });
    const result = checkout(
        { id: 'pay_1', status: 'Authorized', amount: 4500, currency: 'GBP', reference: 'basket-2', metadata: { basket_id: 'basket-2' } },
        { '00007': order }
    ).completePayment({ paymentId: 'pay_1', orderNo: '00007', basketId: 'basket-1' });

    assert.equal(result.status, 'failed');
    assert.deepEqual(calls.voids, ['pay_1']);
});

test('a payment already applied to another order is never applied again', () => {
    const paid = makeContainer({ orderNo: '00001', status: ORDER.ORDER_STATUS_NEW });
    const second = makeContainer({ orderNo: '00002' });

    paid.custom.ckoPaymentId = 'pay_1';
    objects.createCustomObject('ckoPayment', 'pay_1').custom.orderNo = '00001';

    const result = checkout(
        { id: 'pay_1', status: 'Captured', amount: 4500, currency: 'GBP', reference: 'basket-1', metadata: { basket_id: 'basket-1' } },
        { '00001': paid, '00002': second }
    ).completePayment({ paymentId: 'pay_1', orderNo: '00002', basketId: 'basket-1' });

    assert.equal(result.status, 'failed');
    assert.deepEqual(calls.placed, []);
});

test('completePayment refuses a payment with no order', () => {
    const result = checkout({ id: 'pay_1', status: 'Authorized', amount: 4500, currency: 'GBP', reference: 'basket-1' }).completePayment({ paymentId: 'pay_1' });

    assert.equal(result.ok, false);
});

test('createSession: return URLs must use an allowed origin', () => {
    const basket = makeScapiBasket();
    const service = checkout({});

    assert.equal(service.createSession({ basket, successUrl: 'https://evil.example/x', failureUrl: 'https://shop.example/y' }).ok, false);

    const ok = service.createSession({ basket, successUrl: 'http://localhost:5173/cko-return', failureUrl: 'https://shop.example/cko-return?leg=failure' });

    assert.equal(ok.ok, true);
    assert.equal(ok.publicKey, 'pk_sbox_test');
    assert.equal(ok.environment, 'sandbox');
    assert.equal(ok.paymentSession.id, 'ps_1');
});

test('submitPayment: submits with the order number as reference and stores the payment id', () => {
    const order = makeContainer({ orderNo: '00003' });
    const result = checkout({}, { '00003': order }).submitPayment({ sessionId: 'ps_1', sessionData: 'sd_1', orderNo: '00003' });

    assert.equal(result.ok, true);
    assert.equal(calls.submitted[0].id, 'ps_1');
    assert.equal(calls.submitted[0].body.reference, '00003');
    assert.equal(order.custom.ckoPaymentId, 'pay_1');
    assert.equal(objects.getCustomObject('ckoPayment', 'pay_1').custom.orderToken, 'token-00003');
});

test('createSession: a basket without a total is refused with a clear message', () => {
    const result = checkout({}).createSession({
        basket: makeScapiBasket({ orderTotal: null }),
        successUrl: 'http://localhost:5173/cko-return',
        failureUrl: 'http://localhost:5173/cko-return?leg=failure',
    });

    assert.equal(result.ok, false);
    assert.match(result.errorMessage, /order total/);
});

test('submitPayment: refuses an order that is not waiting for payment', () => {
    const order = makeContainer({ orderNo: '00003', status: ORDER.ORDER_STATUS_NEW });

    assert.equal(checkout({}, { '00003': order }).submitPayment({ sessionId: 'ps_1', sessionData: 'sd_1', orderNo: '00003' }).ok, false);
    assert.deepEqual(calls.submitted, []);
});

test('keys pasted with whitespace are trimmed before use', () => {
    const config = load('scripts/checkoutcom/config', {
        preferences: { ckoMode: 'sandbox', ckoSecretKey: '  sk_sbox_abc\n', ckoPublicKey: ' pk_sbox_abc ' },
    });

    assert.equal(config.getSecretKey(), 'sk_sbox_abc');
    assert.equal(config.getPublicKey(), 'pk_sbox_abc');
});

test('createSession: refused while the CHECKOUTCOM_FLOW payment method is disabled', () => {
    const service = load('scripts/checkoutcom/checkout', {
        preferences: KEYS,
        flowActive: false,
        '*/cartridge/scripts/checkoutcom/gateway': gateway({}),
    });
    const result = service.createSession({ basket: makeScapiBasket(), successUrl: 'http://localhost:5173/r', failureUrl: 'http://localhost:5173/r' });

    assert.equal(result.ok, false);
    assert.match(result.errorMessage, /CHECKOUTCOM_FLOW/);
});

test('createSession: returns the ckoFlowAppearance JSON, and ignores invalid JSON', () => {
    const session = (appearance) => load('scripts/checkoutcom/checkout', {
        preferences: { ...KEYS, ckoFlowAppearance: appearance },
        '*/cartridge/scripts/checkoutcom/gateway': gateway({}),
    }).createSession({ basket: makeScapiBasket(), successUrl: 'http://localhost:5173/r', failureUrl: 'http://localhost:5173/r' });

    assert.deepEqual(session('{"colorAction":"#000000"}').appearance, { colorAction: '#000000' });
    assert.equal(session('{not json').appearance, null);
});

test('createSession: returns the Flow Component Options and Translations JSON; invalid or non-object JSON is ignored', () => {
    const session = (preferences) => load('scripts/checkoutcom/checkout', {
        preferences: { ...KEYS, ...preferences },
        '*/cartridge/scripts/checkoutcom/gateway': gateway({}),
    }).createSession({ basket: makeScapiBasket(), successUrl: 'http://localhost:5173/r', failureUrl: 'http://localhost:5173/r' });

    const configured = session({
        ckoFlowComponentOptions: '{"card":{"displayCardholderName":"top"}}',
        ckoFlowTranslations: '{"en-US":{"pay_button.pay":"Pay now"}}',
    });

    assert.deepEqual(configured.componentOptions, { card: { displayCardholderName: 'top' } });
    assert.deepEqual(configured.translations, { 'en-US': { 'pay_button.pay': 'Pay now' } });

    const invalid = session({ ckoFlowComponentOptions: '{oops', ckoFlowTranslations: '["en-US"]' });

    assert.equal(invalid.componentOptions, null);
    assert.equal(invalid.translations, null);
    assert.equal(session({}).componentOptions, null);
});

test('mode picks the service ids and Flow environment: sandbox by default, production when set', () => {
    const config = (mode) => load('scripts/checkoutcom/config', { preferences: { ckoMode: mode } });

    assert.equal(config(null).getMode(), 'sandbox');
    assert.equal(config({ value: 'production', toString: () => 'production' }).getMode(), 'production');
    assert.equal(config('production').getEnvironment(), 'production');
});

test('the Service Endpoint must be an https base URL', () => {
    const endpoint = (value) => load('scripts/checkoutcom/config', { preferences: { ckoServiceEndpoint: value } }).getServiceEndpoint();

    assert.equal(endpoint('https://eu.api.checkout.example/'), 'https://eu.api.checkout.example');
    assert.equal(endpoint('http://insecure.example'), null);
    assert.equal(endpoint(null), null);
});
