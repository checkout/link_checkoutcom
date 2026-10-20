'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { load, makeContainer, makeScapiBasket } = require('./helpers/sfcc');

const options = { successUrl: 'https://shop.example/cko-return', failureUrl: 'https://shop.example/cko-return?leg=failure', locale: 'en-US' };

test('pruneEmpty drops null and empty values but keeps false and 0', () => {
    const payload = load('scripts/checkoutcom/payload');

    assert.deepEqual(
        payload.pruneEmpty({ a: null, b: '', c: false, d: 0, e: { f: null }, g: [null, 'x'], h: { i: 'y', j: undefined } }),
        { c: false, d: 0, g: ['x'], h: { i: 'y' } }
    );
});

test('session request: built from the SCAPI basket, amount in minor units, items add up', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(makeScapiBasket({ shippingTotal: 5 }), options);

    assert.equal(request.amount, 4500);
    assert.equal(request.currency, 'GBP');
    assert.equal(request.items.reduce((sum, item) => sum + item.total_amount, 0), request.amount);
    assert.deepEqual(request.items.map((item) => item.type), ['physical', 'shipping_fee']);
    assert.equal(request.items[0].unit_price, 2000);
});

test('session request: net taxation adds tax as its own item', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(makeScapiBasket({ taxation: 'net', taxTotal: 9 }), options);

    assert.equal(request.items.at(-1).type, 'tax');
    assert.equal(request.items.reduce((sum, item) => sum + item.total_amount, 0), request.amount);
});

test('session request: items are left out when they cannot add up to the order total', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(makeScapiBasket({ orderTotal: 40 }), options);

    assert.equal(request.amount, 4000);
    assert.equal('items' in request, false);
});

/** @returns {number} The sum of the items, checked against each item's own discount arithmetic */
function itemsTotal(items) {
    return items.reduce((sum, item) => {
        assert.equal(item.quantity * item.unit_price - (item.discount_amount || 0), item.total_amount, item.name);

        return sum + item.total_amount;
    }, 0);
}

test('discounts, session: a product promotion shows as the item discount', () => {
    const payload = load('scripts/checkoutcom/payload');
    const basket = makeScapiBasket({ items: [{ productId: 'P1', productName: 'Shirt', quantity: 2, price: 50, priceAfterItemDiscount: 40, priceAfterOrderDiscount: 40 }] });
    const request = payload.buildSessionRequest(basket, options);

    assert.equal(request.amount, 4500);
    assert.deepEqual([request.items[0].unit_price, request.items[0].discount_amount, request.items[0].total_amount], [2500, 1000, 4000]);
    assert.equal(itemsTotal(request.items), request.amount);
});

test('discounts, session: an order promotion or coupon is prorated over the items, which still add up', () => {
    const payload = load('scripts/checkoutcom/payload');
    const basket = makeScapiBasket({
        items: [
            { productId: 'P1', productName: 'Shirt', quantity: 2, price: 40, priceAfterItemDiscount: 40, priceAfterOrderDiscount: 36 },
            { productId: 'P2', productName: 'Hat', quantity: 1, price: 10, priceAfterItemDiscount: 10, priceAfterOrderDiscount: 9 },
        ],
    });
    const request = payload.buildSessionRequest(basket, options);

    assert.equal(request.amount, 5000);
    assert.deepEqual(request.items.map((item) => item.discount_amount), [400, 100, undefined]);
    assert.equal(itemsTotal(request.items), request.amount);
});

test('discounts, session: free shipping keeps a fully discounted shipping line', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(makeScapiBasket({ shippingTotal: 0, shippingItems: [{ price: 5 }] }), options);
    const shipping = request.items.find((item) => item.type === 'shipping_fee');

    assert.equal(request.amount, 4000);
    assert.deepEqual([shipping.unit_price, shipping.discount_amount, shipping.total_amount], [500, 500, 0]);
    assert.equal(itemsTotal(request.items), request.amount);
});

test('discounts, submit: product promotion, prorated coupon and free shipping all reconcile with the amount', () => {
    const payload = load('scripts/checkoutcom/payload');
    const order = makeContainer({ lines: [{ id: 'P1', name: 'Shirt', qty: 2, base: 50, total: 40, prorated: 36 }], shipping: 0, shippingBase: 5 });
    const request = payload.buildSubmitRequest(order, 'sd_1');

    assert.equal(request.amount, 3600);
    assert.deepEqual(request.items.map((item) => [item.type, item.unit_price, item.discount_amount, item.total_amount]), [
        ['physical', 2500, 1400, 3600],
        ['shipping_fee', 500, 500, 0],
    ]);
    assert.equal(itemsTotal(request.items), request.amount);
});

test('discounts, submit: a prorated price that does not divide by the quantity still balances', () => {
    const payload = load('scripts/checkoutcom/payload');
    const order = makeContainer({ lines: [{ id: 'P1', name: 'Mug', qty: 3, base: 30, total: 30, prorated: 26.67 }] });
    const request = payload.buildSubmitRequest(order, 'sd_1');

    assert.equal(request.amount, 3167);
    assert.deepEqual([request.items[0].unit_price, request.items[0].discount_amount], [1000, 333]);
    assert.equal(itemsTotal(request.items), request.amount);
});

test('discounts, submit: options and gift certificates are items too, so the total still matches', () => {
    const payload = load('scripts/checkoutcom/payload');
    const order = makeContainer({
        lines: [{ id: 'P1', name: 'TV', qty: 1, total: 500, prorated: 450, options: [{ id: 'warranty', valueId: '2y', text: 'Warranty: 2 years', base: 50, prorated: 45 }] }],
        giftCertificates: [25],
    });
    const request = payload.buildSubmitRequest(order, 'sd_1');

    assert.equal(request.amount, 52500);
    assert.deepEqual(request.items.map((item) => item.reference), ['P1', 'warranty-2y', 'gc-1', 'shipping']);
    assert.equal(itemsTotal(request.items), request.amount);
});

test('discounts, submit: net taxation adds the tax after the discounted lines', () => {
    const payload = load('scripts/checkoutcom/payload', { taxPolicy: 1 });
    const order = makeContainer({ lines: [{ id: 'P1', name: 'Shirt', qty: 2, base: 40, total: 40, prorated: 30 }], tax: 7, netTax: true });
    const request = payload.buildSubmitRequest(order, 'sd_1');

    assert.equal(request.amount, 4200);
    assert.equal(request.items.at(-1).type, 'tax');
    assert.equal(itemsTotal(request.items), request.amount);
});

test('session request: zero-decimal currencies are not multiplied', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(
        makeScapiBasket({ currency: 'JPY', items: [{ productId: 'P1', productName: 'Tea', quantity: 1, priceAfterItemDiscount: 1200 }], shippingTotal: 0 }),
        options
    );

    assert.equal(request.amount, 1200);
});

test('session request: no null address fields, only risk.enabled, upper case country', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(makeScapiBasket(), options);

    assert.equal(request.billing.address.country, 'GB');
    assert.equal('address_line2' in request.billing.address, false);
    assert.equal('state' in request.billing.address, false);
    assert.deepEqual(request.risk, { enabled: false });
    assert.equal(request.customer.name, 'Jordan Smith');
});

test('session request: reference and metadata identify the basket', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSessionRequest(makeScapiBasket({ basketId: 'bkt-9' }), options);

    assert.equal(request.reference, 'bkt-9');
    assert.equal(request.metadata.basket_id, 'bkt-9');
    assert.equal(request.success_url, options.successUrl);
});

test('session request: capture, 3DS, risk and methods follow the CKO Flow preferences', () => {
    const payload = load('scripts/checkoutcom/payload', {
        preferences: {
            ckoFlowCapture: false,
            cko3ds: true,
            cko3dsChallengeIndicator: { value: 'challenge_requested', toString: () => 'challenge_requested' },
            cko3dsAttemptN3d: { value: 'true', toString: () => 'true' },
            ckoEnableRiskFlag: true,
            ckoFlowPaymentMethods: 'card, applepay ,',
        },
    });
    const request = payload.buildSessionRequest(makeScapiBasket(), options);

    assert.equal(request.capture, false);
    assert.deepEqual(request['3ds'], { enabled: true, challenge_indicator: 'challenge_requested', attempt_n3d: true });
    assert.deepEqual(request.risk, { enabled: true });
    assert.deepEqual(request.enabled_payment_methods, ['card', 'applepay']);
});

test('capture is on unless Flow Auto Capture is switched off', () => {
    const unset = load('scripts/checkoutcom/payload', { preferences: {} }).buildSessionRequest(makeScapiBasket(), options);
    const off = load('scripts/checkoutcom/payload', { preferences: { ckoFlowCapture: false } }).buildSessionRequest(makeScapiBasket(), options);

    assert.equal(unset.capture, true);
    assert.equal(off.capture, false);
});

test('submit request: order number as reference and the order amount', () => {
    const payload = load('scripts/checkoutcom/payload');
    const request = payload.buildSubmitRequest(makeContainer({ orderNo: '00042' }), 'sd_123');

    assert.equal(request.session_data, 'sd_123');
    assert.equal(request.reference, '00042');
    assert.equal(request.amount, 4500);
    assert.equal(request.items.reduce((sum, item) => sum + item.total_amount, 0), 4500);
});

test('3DS defaults: no_preference challenge indicator and no non-3DS attempt', () => {
    const request = load('scripts/checkoutcom/payload', { preferences: {} }).buildSessionRequest(makeScapiBasket(), options);

    assert.deepEqual(request['3ds'], { enabled: false, challenge_indicator: 'no_preference', attempt_n3d: false });
});

test('session metadata carries platform_data in the SFRA format', () => {
    const request = load('scripts/checkoutcom/payload').buildSessionRequest(makeScapiBasket(), options);

    assert.equal(request.metadata.platform_data, 'Checkout.com Storefront Next Cartridge - Version: 26.5.0');
});

test('submit request carries the order billing address chosen after the session was created', () => {
    const order = makeContainer({
        orderNo: '00042',
        billing: { address1: '5 Other Rd', city: 'Paris', postalCode: '75001', countryCode: 'fr', fullName: 'Alex Martin', phone: '+33100000000' },
    });
    const request = load('scripts/checkoutcom/payload').buildSubmitRequest(order, 'sd_1');

    assert.deepEqual(request.billing, {
        address: { address_line1: '5 Other Rd', city: 'Paris', zip: '75001', country: 'FR' },
        phone: { number: '+33100000000' },
    });
    assert.equal(request.customer.name, 'Alex Martin');
    assert.equal(request.customer.email, 'jordan@example.com');
    assert.equal(request.shipping.address.country, 'GB');
});

test('amount follows the order: a total changed after the session (shipping, taxes) is what is charged', () => {
    const payload = load('scripts/checkoutcom/payload');
    const session = payload.buildSessionRequest(makeScapiBasket({ shippingTotal: 5 }), options);
    // shipping changed to 12.50 before Place Order
    const submit = payload.buildSubmitRequest(makeContainer({ orderNo: '00043', shipping: 12.5 }), 'sd_1');

    assert.equal(session.amount, 4500);
    assert.equal(submit.amount, 5250);
    assert.equal(submit.items.reduce((sum, item) => sum + item.total_amount, 0), 5250);
});

test('save payment details: the card consent checkbox, for registered shoppers only, when the preference is on', () => {
    const session = (preferences, registered) => {
        globalThis.customer = { getID: () => 'cust-1', isRegistered: () => registered };

        try {
            return load('scripts/checkoutcom/payload', { preferences }).buildSessionRequest(makeScapiBasket(), options);
        } finally {
            delete globalThis.customer;
        }
    };
    const on = session({ ckoFlowSavePaymentDetails: true }, true);

    assert.deepEqual(on.payment_method_configuration, { card: { store_payment_details: 'collect_consent' } });
    assert.equal('store_payment_details' in on, false);
    assert.equal('payment_method_configuration' in session({ ckoFlowSavePaymentDetails: true }, false), false);
    assert.equal('payment_method_configuration' in session({ ckoFlowSavePaymentDetails: false }, true), false);
});
