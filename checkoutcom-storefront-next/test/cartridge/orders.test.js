'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { load, makeContainer } = require('./helpers/sfcc');

afterEach(() => {
    delete globalThis.customer;
});

test('getShopperOrder returns the calling shopper\'s order only', () => {
    const mine = makeContainer({ orderNo: '1', customerId: 'cust-1' });
    const theirs = makeContainer({ orderNo: '2', customerId: 'cust-2' });
    const orders = load('scripts/checkoutcom/orders', { 'dw/order/OrderMgr': { getOrder: (no) => ({ 1: mine, 2: theirs })[no] } });

    globalThis.customer = { getID: () => 'cust-1' };

    assert.equal(orders.getShopperOrder('1'), mine);
    assert.equal(orders.getShopperOrder('2'), null);
});

test('without a shopper (no customer global) no order is returned, and nothing throws', () => {
    const orders = load('scripts/checkoutcom/orders', { 'dw/order/OrderMgr': { getOrder: () => makeContainer() } });

    assert.equal(orders.getShopperOrder('1'), null);
});
