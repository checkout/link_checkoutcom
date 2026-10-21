'use strict';

/**
 * Race conditions in int_checkoutcom_sfra: concurrent placements, failing an
 * order another request placed, lost responses, out-of-order and repeated
 * webhooks, and the Flow completion paths.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var constants = require(CARTRIDGE + '/config/constants');
var flowConfig = require(CARTRIDGE + '/config/ckoFlowConfig');

var ORDER = {
    ORDER_STATUS_CREATED: 0,
    ORDER_STATUS_NEW: 3,
    ORDER_STATUS_OPEN: 4,
    ORDER_STATUS_COMPLETED: 5,
    ORDER_STATUS_CANCELLED: 6,
    ORDER_STATUS_FAILED: 8,
    PAYMENT_STATUS_NOTPAID: 0,
    PAYMENT_STATUS_PARTPAID: 1,
    PAYMENT_STATUS_PAID: 2,
    CONFIRMATION_STATUS_NOTCONFIRMED: 0,
    CONFIRMATION_STATUS_CONFIRMED: 2,
    EXPORT_STATUS_READY: 2,
};

/**
 * A fake dw.order.Order.
 * @param {Object} opts orderNo, status, paymentStatus, instruments [{ method, transactionID }]
 * @returns {Object} The order
 */
function makeOrder(opts) {
    var options = opts || {};
    var instruments = (options.instruments || [{ method: 'CHECKOUTCOM_CARD', transactionID: null }]).map(function(definition) {
        var transaction = {
            transactionID: definition.transactionID || null,
            setTransactionID: function(id) { this.transactionID = id; },
            getTransactionID: function() { return this.transactionID; },
            setPaymentProcessor: function() {},
            setType: function() {},
            custom: {},
        };

        return {
            method: definition.method,
            paymentTransaction: transaction,
            getPaymentTransaction: function() { return transaction; },
            getUUID: function() { return definition.method + '-uuid'; },
            custom: {},
        };
    });
    var order = {
        status: options.status === undefined ? ORDER.ORDER_STATUS_CREATED : options.status,
        paymentStatus: options.paymentStatus === undefined ? ORDER.PAYMENT_STATUS_NOTPAID : options.paymentStatus,
        confirmationStatus: null,
        exportStatus: null,
        notes: [],
        custom: {},
        orderNo: options.orderNo || '00001',
        orderToken: 'token',
        PAYMENT_STATUS_PAID: ORDER.PAYMENT_STATUS_PAID,
        PAYMENT_STATUS_NOTPAID: ORDER.PAYMENT_STATUS_NOTPAID,
        CONFIRMATION_STATUS_CONFIRMED: ORDER.CONFIRMATION_STATUS_CONFIRMED,
        CONFIRMATION_STATUS_NOTCONFIRMED: ORDER.CONFIRMATION_STATUS_NOTCONFIRMED,
        getOrderNo: function() { return this.orderNo; },
        getOrderToken: function() { return this.orderToken; },
        getStatus: function() { var self = this; return { getValue: function() { return self.status; } }; },
        getPaymentStatus: function() { var self = this; return { getValue: function() { return self.paymentStatus; } }; },
        setPaymentStatus: function(value) { this.paymentStatus = value; },
        setConfirmationStatus: function(value) { this.confirmationStatus = value; },
        setExportStatus: function(value) { this.exportStatus = value; },
        addNote: function(subject, text) { this.notes.push(text); },
        getPaymentInstruments: function(method) {
            var list = method ? instruments.filter(function(instrument) { return instrument.method === method; }) : instruments;

            return { toArray: function() { return list.slice(); }, size: function() { return list.length; }, length: list.length };
        },
    };

    return order;
}

/**
 * The dw fakes the guard needs, over a set of orders.
 * @param {Object} ordersByNo The orders by number
 * @param {Object} overrides OrderMgr overrides, gateway response
 * @returns {Object} The fakes and the recorded calls
 */
function fakes(ordersByNo, overrides) {
    var options = overrides || {};
    var calls = { placed: [], failed: [], gateway: [] };
    var objects = {};

    var OrderMgr = {
        getOrder: function(orderNo) { return ordersByNo[orderNo] || null; },
        placeOrder: options.placeOrder || function(order) {
            calls.placed.push(order.getOrderNo());
            order.status = ORDER.ORDER_STATUS_NEW; // eslint-disable-line no-param-reassign

            return { isError: function() { return false; } };
        },
        failOrder: function(order) {
            calls.failed.push(order.getOrderNo());
            order.status = ORDER.ORDER_STATUS_FAILED; // eslint-disable-line no-param-reassign

            return { isError: function() { return false; } };
        },
    };

    var ckoHelper = {
        getValue: function() { return 'sandbox'; },
        gatewayClientRequest: function(serviceId, data, method) {
            calls.gateway.push({ serviceId: serviceId, data: data, method: method });

            return options.gateway ? options.gateway(serviceId, data, method) : null;
        },
    };

    var CustomObjectMgr = {
        getCustomObject: function(type, key) { return objects[type + '/' + key] || null; },
        createCustomObject: function(type, key) {
            if (objects[type + '/' + key]) {
                throw new Error('exists');
            }

            objects[type + '/' + key] = { custom: {} };

            return objects[type + '/' + key];
        },
    };

    return {
        calls: calls,
        objects: objects,
        stubs: {
            'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {} }; } },
            'dw/order/Order': ORDER,
            'dw/order/OrderMgr': OrderMgr,
            'dw/object/CustomObjectMgr': CustomObjectMgr,
            'dw/system/Transaction': { wrap: function(fn) { return fn(); }, begin: function() {}, commit: function() {}, rollback: function() {} },
            '*/cartridge/scripts/helpers/ckoHelper': ckoHelper,
            '*/cartridge/config/constants': constants,
        },
    };
}

function loadGuard(env) {
    return proxyquire(CARTRIDGE + '/scripts/helpers/orderGuard', env.stubs);
}

describe('orderGuard: placing an order once', function() {
    it('places an open order and confirms it', function() {
        var order = makeOrder();
        var env = fakes({ '00001': order });
        var result = loadGuard(env).placeOrder(order);

        assert.isFalse(result.error);
        assert.isFalse(result.alreadyPlaced);
        assert.deepEqual(env.calls.placed, ['00001']);
        assert.equal(order.confirmationStatus, ORDER.CONFIRMATION_STATUS_CONFIRMED);
        assert.equal(order.exportStatus, ORDER.EXPORT_STATUS_READY);
    });

    it('a second request (refresh, other tab, the other leg) gets success without placing again', function() {
        var order = makeOrder({ status: ORDER.ORDER_STATUS_NEW });
        var env = fakes({ '00001': order });
        var result = loadGuard(env).placeOrder(order);

        assert.isFalse(result.error);
        assert.isTrue(result.alreadyPlaced);
        assert.deepEqual(env.calls.placed, []);
        assert.deepEqual(env.calls.failed, []);
    });

    it('losing to a concurrent request (optimistic lock) is a success, and never fails the order', function() {
        var stale = makeOrder();
        var stored = makeOrder({ status: ORDER.ORDER_STATUS_CREATED });
        var ordersByNo = { '00001': stored };
        var env = fakes(ordersByNo, {
            placeOrder: function() {
                // The other request commits first
                stored.status = ORDER.ORDER_STATUS_NEW;
                throw new Error('ORMOptimisticLockingException');
            },
        });
        var result = loadGuard(env).placeOrder(stale);

        assert.isFalse(result.error);
        assert.isTrue(result.alreadyPlaced);
        assert.deepEqual(env.calls.failed, []);
    });

    it('a genuine placement failure is reported without failing the order (the caller releases the payment)', function() {
        var order = makeOrder();
        var env = fakes({ '00001': order }, {
            placeOrder: function() { return { isError: function() { return true; }, getMessage: function() { return 'inventory'; } }; },
        });
        var result = loadGuard(env).placeOrder(order);

        assert.isTrue(result.error);
        assert.deepEqual(env.calls.failed, []);
    });

    it('refuses a failed order, and keeps a fraud-flagged order unconfirmed', function() {
        var failed = makeOrder({ status: ORDER.ORDER_STATUS_FAILED });
        var flagged = makeOrder({ orderNo: '00002' });
        var env = fakes({ '00001': failed, '00002': flagged });
        var guard = loadGuard(env);

        assert.isTrue(guard.placeOrder(failed).closed);
        guard.placeOrder(flagged, { status: 'flag' });
        assert.equal(flagged.confirmationStatus, ORDER.CONFIRMATION_STATUS_NOTCONFIRMED);
    });
});

describe('orderGuard: failing only an open order', function() {
    it('fails an open order and leaves a placed one alone', function() {
        var open = makeOrder();
        var placed = makeOrder({ orderNo: '00002', status: ORDER.ORDER_STATUS_NEW, paymentStatus: ORDER.PAYMENT_STATUS_PAID });
        var env = fakes({ '00001': open, '00002': placed });
        var guard = loadGuard(env);

        assert.isTrue(guard.failOrder(open));
        assert.isFalse(guard.failOrder(placed));
        assert.deepEqual(env.calls.failed, ['00001']);
        assert.equal(placed.paymentStatus, ORDER.PAYMENT_STATUS_PAID);
    });

    it('re-reads the order: one placed by another request since it was loaded is not failed', function() {
        var stale = makeOrder();
        var stored = makeOrder({ status: ORDER.ORDER_STATUS_NEW });
        var env = fakes({ '00001': stored });

        assert.isFalse(loadGuard(env).failOrder(stale));
        assert.deepEqual(env.calls.failed, []);
    });
});

describe('orderGuard: payments left behind by a failed order', function() {
    function gatewayWith(payments) {
        return function(serviceId, data) {
            if (data.query) {
                return { data: payments };
            }

            return { action_id: 'act_' + data.chargeId };
        };
    }

    it('voids an authorized payment and refunds a captured one, by reference; a declined one is left', function() {
        var env = fakes({}, {
            gateway: gatewayWith([
                { id: 'pay_auth', status: 'Authorized', reference: '00001' },
                { id: 'pay_cap', status: 'Captured', reference: '00001' },
                { id: 'pay_dec', status: 'Declined', reference: '00001' },
                { id: 'pay_other', status: 'Authorized', reference: '00099' },
            ]),
        });

        assert.isTrue(loadGuard(env).reverseStrayPayments('00001'));

        var actions = env.calls.gateway.filter(function(call) { return call.data.chargeId; });

        assert.deepEqual(actions.map(function(call) { return [call.serviceId, call.data.chargeId]; }), [
            ['cko.transaction.void.sandbox.service', 'pay_auth'],
            ['cko.transaction.refund.sandbox.service', 'pay_cap'],
        ]);
        assert.equal(env.calls.gateway[0].data.query, 'reference=00001&limit=10');
        assert.equal(env.calls.gateway[0].method, 'GET');
    });

    it('reports a lookup that failed (timeout) instead of assuming nothing was charged', function() {
        var env = fakes({}, { gateway: function() { return 504; } });

        assert.isFalse(loadGuard(env).reverseStrayPayments('00001'));
    });
});

describe('orderGuard: recording the payment id while a webhook writes the same order', function() {
    it('retries once on a fresh copy, and never throws', function() {
        var order = makeOrder();
        var instrument = order.getPaymentInstruments().toArray()[0];
        var env = fakes({ '00001': order });
        var attempts = 0;

        env.stubs['dw/system/Transaction'] = {
            wrap: function(fn) {
                attempts += 1;

                if (attempts === 1) {
                    throw new Error('ORMOptimisticLockingException');
                }

                return fn();
            },
        };

        assert.doesNotThrow(function() {
            loadGuard(env).recordTransaction('00001', instrument, {}, 'pay_1');
        });
        assert.equal(instrument.paymentTransaction.transactionID, 'pay_1');
    });
});

describe('orderGuard: webhook bookkeeping', function() {
    it('remembers applied events', function() {
        var env = fakes({});
        var guard = loadGuard(env);

        assert.isFalse(guard.isWebhookApplied('evt_1'));
        guard.markWebhookApplied('evt_1', 'payment_captured');
        guard.markWebhookApplied('evt_1', 'payment_captured');
        assert.isTrue(guard.isWebhookApplied('evt_1'));
    });

    it('ranks polling notifications so a late pending never hides a capture', function() {
        var guard = loadGuard(fakes({}));

        assert.isAbove(guard.notificationRank('payment_capture_pending'), guard.notificationRank('payment_pending'));
        assert.isAbove(guard.notificationRank('payment_captured'), guard.notificationRank('bank_account_updated'));
    });
});

describe('Flow: completion races (flowPaymentHelper)', function() {
    function loadFlow(env, flowHelperOverrides) {
        var guard = loadGuard(env);
        var flowHelper = Object.assign({
            getPaymentDetails: sinon.stub().returns(null),
            matchesOrder: sinon.stub().returns(true),
            isApproved: function(payment) { return payment.status === 'Authorized' || payment.status === 'Captured'; },
            isPending: function(payment) { return payment.status === 'Pending'; },
            voidPayment: sinon.stub(),
        }, flowHelperOverrides || {});

        return {
            flowHelper: flowHelper,
            helper: proxyquire(CARTRIDGE + '/scripts/helpers/flowPaymentHelper', Object.assign({}, env.stubs, {
                'dw/order/BasketMgr': { getCurrentBasket: function() { return null; } },
                'dw/order/PaymentMgr': { getPaymentMethod: function() { return { getPaymentProcessor: function() { return {}; } }; } },
                'dw/order/PaymentTransaction': { TYPE_AUTH: 'AUTH', TYPE_CAPTURE: 'CAPTURE' },
                '*/cartridge/scripts/checkout/checkoutHelpers': {},
                '*/cartridge/scripts/helpers/ckoHelper': Object.assign({ log: function() {}, checkAndRestoreBasket: sinon.stub() }, env.stubs['*/cartridge/scripts/helpers/ckoHelper']),
                '*/cartridge/scripts/helpers/flowHelper': flowHelper,
                '*/cartridge/scripts/helpers/orderGuard': guard,
                '*/cartridge/config/ckoFlowConfig': flowConfig,
            })),
        };
    }

    var flowOrder = function(opts) {
        return makeOrder(Object.assign({ instruments: [{ method: flowConfig.PAYMENT_METHOD_ID }] }, opts || {}));
    };

    it('the request that loses the race reports success and never voids the payment the winner placed', function() {
        var order = flowOrder({ status: ORDER.ORDER_STATUS_NEW });

        order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).toArray()[0].paymentTransaction.transactionID = 'pay_1';

        var env = fakes({ '00001': order }, { gateway: function() { return { action_id: 'x' }; } });
        var flow = loadFlow(env);
        var result = flow.helper.completeOrder(order, 'pay_1', { id: 'pay_1', status: 'Authorized', reference: '00001' });

        assert.isFalse(result.error);
        assert.isTrue(result.alreadyPlaced);
        assert.lengthOf(env.calls.gateway.filter(function(call) { return call.data.chargeId; }), 0);
        assert.isFalse(flow.flowHelper.voidPayment.called);
    });

    it('a second payment for an order already paid is released', function() {
        var order = flowOrder({ status: ORDER.ORDER_STATUS_NEW });

        order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).toArray()[0].paymentTransaction.transactionID = 'pay_1';

        var env = fakes({ '00001': order }, { gateway: function() { return { action_id: 'x' }; } });
        var result = loadFlow(env).helper.completeOrder(order, 'pay_2', { id: 'pay_2', status: 'Authorized', reference: '00001' });

        assert.isFalse(result.error);
        assert.deepEqual(env.calls.gateway.map(function(call) { return call.data.chargeId; }), ['pay_2']);
    });

    it('a payment that cannot be read back keeps the order open (unverified, not failed)', function() {
        var order = flowOrder();
        var env = fakes({ '00001': order });
        var result = loadFlow(env).helper.completeOrder(order, 'pay_1');

        assert.isTrue(result.error);
        assert.isTrue(result.unverified);
        assert.deepEqual(env.calls.failed, []);
    });

    it('leaving the payment page completes an order whose payment went through, instead of failing it', function() {
        var order = flowOrder();
        var payment = { id: 'pay_1', status: 'Authorized', reference: '00001' };
        var env = fakes({ '00001': order }, { gateway: function(serviceId, data) { return data.query ? { data: [payment] } : null; } });
        var flow = loadFlow(env, { getPaymentDetails: sinon.stub().returns(payment) });
        var released = flow.helper.releaseOrder(order);

        assert.equal(released.status, 'complete');
        assert.deepEqual(env.calls.placed, ['00001']);
        assert.deepEqual(env.calls.failed, []);
    });

    it('leaving the payment page keeps the order when Checkout.com cannot be asked', function() {
        var order = flowOrder();
        var env = fakes({ '00001': order }, { gateway: function() { return 504; } });

        assert.equal(loadFlow(env).helper.releaseOrder(order).status, 'unverified');
        assert.deepEqual(env.calls.failed, []);
    });

    it('leaving the payment page with no payment fails the order', function() {
        var order = flowOrder();
        var env = fakes({ '00001': order }, { gateway: function() { return { data: [] }; } });

        assert.equal(loadFlow(env).helper.releaseOrder(order).status, 'failed');
        assert.deepEqual(env.calls.failed, ['00001']);
    });
});

describe('Webhooks: stale and out-of-order events (eventsHelper)', function() {
    function loadEvents(env) {
        return proxyquire(CARTRIDGE + '/scripts/helpers/eventsHelper', Object.assign({}, env.stubs, {
            'dw/order/PaymentTransaction': {},
            'dw/order/PaymentMgr': {},
            '*/cartridge/scripts/helpers/ckoHelper': { _: function(key) { return key; } },
            '*/cartridge/scripts/helpers/savedCardHelper': { updateSavedCard: function() {} },
            '*/cartridge/scripts/helpers/transactionHelper': { createAuthorization: function() {} },
            '*/cartridge/config/ckoFlowConfig': flowConfig,
        }));
    }

    function hook(type, paymentId) {
        return { id: 'evt_' + type, type: type, data: { id: paymentId, reference: '00001', action_id: 'act_1', response_code: '20005' } };
    }

    it('a decline for the order\'s own payment fails the open order', function() {
        var order = makeOrder({ instruments: [{ method: 'CHECKOUTCOM_CARD', transactionID: 'pay_1' }] });
        var env = fakes({ '00001': order });

        loadEvents(env).paymentDeclined(hook('payment_declined', 'pay_1'));

        assert.deepEqual(env.calls.failed, ['00001']);
    });

    it('a decline for an earlier or stray payment never fails the order paid with another one', function() {
        var order = makeOrder({ instruments: [{ method: 'CHECKOUTCOM_CARD', transactionID: 'pay_2' }] });
        var env = fakes({ '00001': order });

        loadEvents(env).paymentDeclined(hook('payment_declined', 'pay_1'));

        assert.deepEqual(env.calls.failed, []);
    });

    it('a Flow decline with no payment recorded yet is left to the completion (the shopper may retry)', function() {
        var order = makeOrder({ instruments: [{ method: flowConfig.PAYMENT_METHOD_ID }] });
        var env = fakes({ '00001': order });

        loadEvents(env).paymentDeclined(hook('payment_declined', 'pay_1'));

        assert.deepEqual(env.calls.failed, []);
    });

    it('an approval delivered after the capture never sets a paid order back to not paid', function() {
        var order = makeOrder({ status: ORDER.ORDER_STATUS_NEW, paymentStatus: ORDER.PAYMENT_STATUS_PAID });
        var env = fakes({ '00001': order });

        loadEvents(env).paymentApproved(hook('payment_approved', 'pay_1'));

        assert.equal(order.paymentStatus, ORDER.PAYMENT_STATUS_PAID);
    });
});
