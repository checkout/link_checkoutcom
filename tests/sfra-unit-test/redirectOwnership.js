'use strict';

/**
 * CKOMain-HandleReturn / HandleFail: a redirect URL is only a link, so another
 * shopper's order is never failed, its basket never restored into this
 * session, and its confirmation page (with the order token) never shown.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var constants = require(CARTRIDGE + '/config/constants');

/**
 * The real orderGuard payment checks (isPaidAmount, isPaymentFor, isLive), over the given ckoHelper.
 * @param {Object} ckoHelper The ckoHelper fake (getAmount, getFormattedPrice)
 * @returns {Object} orderGuard
 */
function realOrderGuard(ckoHelper) {
    return proxyquire(CARTRIDGE + '/scripts/helpers/orderGuard', {
        'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {} }; } },
        'dw/order/Order': {},
        'dw/order/OrderMgr': {},
        'dw/object/CustomObjectMgr': {},
        'dw/system/Transaction': {},
        '*/cartridge/scripts/helpers/ckoHelper': ckoHelper,
        '*/cartridge/config/constants': constants,
    });
}

describe('CKOMain redirect ownership', function() {
    var routes;
    var orderGuard;
    var paymentHelper;
    var ckoHelper;
    var order;
    var payment;

    /**
     * Load CKOMain with a fake server that keeps the route handlers.
     */
    function load() {
        routes = {};

        var route = function(name) {
            routes[name] = arguments[arguments.length - 1];
        };
        var server = {
            get: route,
            post: route,
            use: route,
            middleware: { https: function() {} },
            exports: function() { return {}; },
        };

        proxyquire(CARTRIDGE + '/controllers/CKOMain', {
            server: server,
            'dw/order/OrderMgr': { getOrder: function() { return order; } },
            'dw/order/BasketMgr': {},
            'dw/web/Resource': { msg: function(key) { return key; } },
            'dw/system/Transaction': { wrap: function(fn) { return fn(); } },
            'dw/system/Logger': { getLogger: function() { return { warn: function() {}, error: function() {}, info: function() {} }; } },
            'dw/util/Locale': {},
            'dw/web/URLUtils': { url: function() { return ''; } },
            '*/cartridge/scripts/cart/cartHelpers': {},
            '*/cartridge/scripts/helpers/basketCalculationHelpers': {},
            '*/cartridge/models/cart': function() {},
            '*/cartridge/scripts/helpers/eventsHelper': {},
            '*/cartridge/scripts/middleware/csrf': {},
            '*/cartridge/scripts/helpers/ckoHelper': ckoHelper,
            '*/cartridge/scripts/helpers/paymentHelper': paymentHelper,
            '*/cartridge/scripts/helpers/orderGuard': orderGuard,
            '*/cartridge/config/ckoApmFilterConfig': {},
            '*/cartridge/config/ckoMadaConfig': {},
            '*/cartridge/config/constants': constants,
        });
    }

    /**
     * @param {string} customerId The session customer's id
     * @returns {Object} A request for the order's redirect
     */
    function request(customerId) {
        return { querystring: { reference: 'ORDER-1' }, currentCustomer: { raw: { ID: customerId } } };
    }

    beforeEach(function() {
        order = {
            PAYMENT_STATUS_PAID: 2,
            PAYMENT_STATUS_NOTPAID: 0,
            CONFIRMATION_STATUS_CONFIRMED: 2,
            getOrderNo: function() { return 'ORDER-1'; },
            getCurrencyCode: function() { return 'EUR'; },
            getCustomer: function() { return { getID: function() { return 'victim'; } }; },
            getPaymentInstruments: function() { return []; },
            getPaymentStatus: function() { return { getValue: function() { return 0; } }; },
            setPaymentStatus: function() {},
            setConfirmationStatus: function() {},
        };
        payment = { id: 'pay_1', reference: 'ORDER-1', status: 'Declined', amount: 4500, currency: 'EUR' };
        orderGuard = {
            findPayments: sinon.stub().returns({ ok: true, payments: [{ id: 'pay_1' }] }),
            isPlaced: sinon.stub().returns(false),
            isOpen: sinon.stub().returns(true),
            isLive: sinon.stub().returns(true),
            failOrder: sinon.stub().returns(true),
            placeOrder: sinon.spy(function() { return { error: false, order: order }; }),
            reversePayment: sinon.spy(),
        };
        paymentHelper = {
            getConfirmationPageRedirect: sinon.spy(),
            getFailurePageRedirect: sinon.spy(),
            getUnverifiedPageRedirect: sinon.spy(),
        };
        ckoHelper = {
            getValue: function() { return 'sandbox'; },
            gatewayClientRequest: function() { return payment; },
            redirectPaymentSuccess: function(p) { return p.status === 'Authorized' || p.status === 'Captured'; },
            getAmount: function() { return '4500'; },
            getFormattedPrice: function(value) { return String(Math.round(Number(value) * 100)); },
            checkAndRestoreBasket: sinon.spy(),
        };
        orderGuard.isPaidAmount = realOrderGuard(ckoHelper).isPaidAmount;
        load();
    });

    ['HandleReturn', 'HandleFail'].forEach(function(name) {
        it(name + ' does not fail another shopper\'s order nor restore its basket', function() {
            routes[name](request('attacker'), {}, function() {});

            assert.isFalse(orderGuard.failOrder.called);
            assert.isFalse(ckoHelper.checkAndRestoreBasket.called);
            assert.isTrue(paymentHelper.getFailurePageRedirect.calledOnce);
        });

        it(name + ' does not show another shopper\'s confirmation page', function() {
            orderGuard.isPlaced.returns(true);

            routes[name](request('attacker'), {}, function() {});

            assert.isFalse(paymentHelper.getConfirmationPageRedirect.called);
            assert.isTrue(paymentHelper.getUnverifiedPageRedirect.calledOnce);
        });
    });

    it('fails the shopper\'s own declined order and restores the basket', function() {
        routes.HandleFail(request('victim'), {}, function() {});

        assert.isTrue(orderGuard.failOrder.calledOnce);
        assert.isTrue(ckoHelper.checkAndRestoreBasket.calledOnce);
    });

    it('places another shopper\'s paid order without showing its confirmation', function() {
        payment.status = 'Captured';

        routes.HandleReturn(request('attacker'), {}, function() {});

        assert.isTrue(orderGuard.placeOrder.calledOnce);
        assert.isFalse(paymentHelper.getConfirmationPageRedirect.called);
        assert.isTrue(paymentHelper.getUnverifiedPageRedirect.calledOnce);
    });

    it('confirms the shopper\'s own paid order', function() {
        payment.status = 'Captured';

        routes.HandleReturn(request('victim'), {}, function() {});

        assert.isTrue(paymentHelper.getConfirmationPageRedirect.calledOnce);
    });

    it('does not place an order for a payment of another amount or currency', function() {
        payment.status = 'Captured';
        payment.amount = 100;

        routes.HandleReturn(request('victim'), {}, function() {});

        assert.isFalse(orderGuard.placeOrder.called);
        assert.isTrue(paymentHelper.getFailurePageRedirect.calledOnce);
        assert.isTrue(orderGuard.reversePayment.calledOnce);

        load();
        payment.amount = 4500;
        payment.currency = 'GBP';
        routes.HandleReturn(request('victim'), {}, function() {});

        assert.isFalse(orderGuard.placeOrder.called);
    });

    it('accepts the Checkout.com instrument\'s amount when a gift certificate paid the rest', function() {
        payment.status = 'Captured';
        payment.amount = 2000;
        order.getPaymentInstruments = function() {
            return [
                { getPaymentMethod: function() { return 'GIFT_CERTIFICATE'; }, getPaymentTransaction: function() { return { getAmount: function() { return { isAvailable: function() { return true; }, getValue: function() { return 25; } }; } }; } },
                { getPaymentMethod: function() { return 'CHECKOUTCOM_APM'; }, getPaymentTransaction: function() { return { getAmount: function() { return { isAvailable: function() { return true; }, getValue: function() { return 20; } }; } }; } },
            ];
        };

        routes.HandleReturn(request('victim'), {}, function() {});

        assert.isTrue(orderGuard.placeOrder.calledOnce);
    });
});

describe('ckoHelper.redirectPaymentSuccess', function() {
    var ckoHelper = proxyquire(CARTRIDGE + '/scripts/helpers/ckoHelper', {
        'dw/system/Transaction': {},
        'dw/order/OrderMgr': {},
        'dw/order/BasketMgr': {},
        'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; } },
        'dw/object/SystemObjectMgr': {},
        'dw/web/Resource': { msg: function(key) { return key; } },
        'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; } }; } },
        'dw/util/Locale': {},
        'dw/crypto/Mac': function() {},
        'dw/crypto/Encoding': {},
        '*/cartridge/config/ckoCurrencyConfig': {},
        '*/cartridge/config/ckoMadaConfig': {},
        '*/cartridge/config/constants': constants,
        '*/cartridge/scripts/cart/cartHelpers': {},
        '*/cartridge/scripts/helpers/sensitiveDataHelper.js': {},
        '*/cartridge/scripts/services/ckoPayments': {},
    });

    it('counts Tabby and Bancontact as paid only once authorized or captured', function() {
        ['tabby', 'bancontact'].forEach(function(type) {
            assert.isTrue(ckoHelper.redirectPaymentSuccess({ source: { type: type }, status: 'Authorized' }));
            assert.isTrue(ckoHelper.redirectPaymentSuccess({ source: { type: type }, status: 'Captured' }));
            assert.isFalse(ckoHelper.redirectPaymentSuccess({ source: { type: type }, status: 'Declined' }));
            assert.isFalse(ckoHelper.redirectPaymentSuccess({ source: { type: type }, status: 'Pending' }));
            assert.isFalse(ckoHelper.redirectPaymentSuccess({ source: { type: type }, status: 'Expired' }));
        });
    });

    it('counts a pending voucher as a success, never a declined or expired one', function() {
        assert.isTrue(ckoHelper.redirectPaymentSuccess({ source: { type: 'oxxo' }, status: 'Pending' }));
        assert.isFalse(ckoHelper.redirectPaymentSuccess({ source: { type: 'boleto' }, status: 'Expired' }));
        assert.isFalse(ckoHelper.redirectPaymentSuccess({ source: { type: 'alipay' }, status: 'Declined' }));
    });
});
