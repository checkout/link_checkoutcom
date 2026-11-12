'use strict';

/**
 * An order is placed only on a payment that pays it: made for it, approved, in a
 * paid state (or pending, and then not exported until paid), for its amount and
 * currency. Client-chosen values (APM type, a stale payment context) and other
 * methods' orders never get one placed without its payment.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var constants = require(CARTRIDGE + '/config/constants');

var log = { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; }, error: function() {} };
var ckoHelperFake = {
    getAmount: function(order) { return String(Math.round(order.total * 100)); },
    getFormattedPrice: function(value) { return String(Math.round(Number(value) * 100)); },
};

/**
 * @returns {Object} The real orderGuard, over the ckoHelper fake
 */
function loadOrderGuard() {
    return proxyquire(CARTRIDGE + '/scripts/helpers/orderGuard', {
        'dw/system/Logger': log,
        'dw/order/Order': {},
        'dw/order/OrderMgr': {},
        'dw/object/CustomObjectMgr': {},
        'dw/system/Transaction': {},
        '*/cartridge/scripts/helpers/ckoHelper': ckoHelperFake,
        '*/cartridge/config/constants': constants,
    });
}

/**
 * @param {Object} [options] orderNo, total, currency, methods (payment method ids)
 * @returns {Object} An order fake
 */
function makeOrder(options) {
    var opts = options || {};
    var methods = opts.methods || ['CHECKOUTCOM_CARD'];
    var instruments = methods.map(function(method) {
        return {
            getPaymentMethod: function() { return method; },
            getPaymentTransaction: function() { return { getAmount: function() { return { isAvailable: function() { return false; } }; } }; },
        };
    });

    return {
        orderNo: opts.orderNo || '00001',
        total: opts.total === undefined ? 45 : opts.total,
        getOrderNo: function() { return opts.orderNo || '00001'; },
        getCurrencyCode: function() { return opts.currency || 'EUR'; },
        getCustomer: function() { return { getID: function() { return 'shopper'; } }; },
        getPaymentInstruments: function(method) {
            var list = method ? instruments.filter(function(i) { return i.getPaymentMethod() === method; }) : instruments;

            return { toArray: function() { return list; }, size: function() { return list.length; }, length: list.length };
        },
        addNote: sinon.spy(),
    };
}

describe('orderGuard.isPaymentFor: a payment pays its order only when approved, paid, and for its amount', function() {
    var orderGuard = loadOrderGuard();
    var order = makeOrder();
    var paid = function(overrides) { return Object.assign({ id: 'pay_1', reference: '00001', approved: true, status: 'Captured', amount: 4500, currency: 'EUR' }, overrides); };

    it('accepts an authorized or captured payment for the order', function() {
        assert.isTrue(orderGuard.isPaymentFor(order, paid()));
        assert.isTrue(orderGuard.isPaymentFor(order, paid({ status: 'Authorized' })));
    });

    it('refuses a payment declined, voided, refunded, expired or not approved', function() {
        ['Declined', 'Voided', 'Refunded', 'Expired', 'Canceled', 'Card Verified'].forEach(function(status) {
            assert.isFalse(orderGuard.isPaymentFor(order, paid({ status: status })), status);
        });
        assert.isFalse(orderGuard.isPaymentFor(order, paid({ approved: false })));
    });

    it('refuses another order\'s payment, another amount, another currency', function() {
        assert.isFalse(orderGuard.isPaymentFor(order, paid({ reference: '00002' })));
        assert.isFalse(orderGuard.isPaymentFor(order, paid({ amount: 100 })));
        assert.isFalse(orderGuard.isPaymentFor(order, paid({ currency: 'GBP' })));
    });

    it('accepts a pending payment only when asked to', function() {
        assert.isFalse(orderGuard.isPaymentFor(order, paid({ status: 'Pending' })));
        assert.isTrue(orderGuard.isPaymentFor(order, paid({ status: 'Pending' }), { allowPending: true }));
    });
});

describe('Redirect return (ckoHelper.redirectPaymentSuccess): a voided or refunded payment is not paid', function() {
    var ckoHelper;
    var originalEmpty;

    before(function() {
        originalEmpty = global.empty;
        global.empty = function(value) { return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0); };
        var stubs = {};
        ['*/cartridge/config/ckoCurrencyConfig', '*/cartridge/config/ckoMadaConfig', '*/cartridge/scripts/cart/cartHelpers', '*/cartridge/scripts/helpers/sensitiveDataHelper.js', '*/cartridge/scripts/services/ckoPayments',
            'dw/crypto/Encoding', 'dw/crypto/Mac', 'dw/object/SystemObjectMgr', 'dw/order/BasketMgr', 'dw/order/OrderMgr', 'dw/system/Site', 'dw/system/Transaction', 'dw/util/Locale', 'dw/web/Resource'].forEach(function(name) { stubs[name] = {}; });
        stubs['dw/system/Logger'] = log;
        stubs['*/cartridge/config/constants'] = constants;
        ckoHelper = proxyquire(CARTRIDGE + '/scripts/helpers/ckoHelper', stubs);
    });

    after(function() {
        global.empty = originalEmpty;
    });

    it('counts an authorized or captured card payment', function() {
        assert.isTrue(ckoHelper.redirectPaymentSuccess({ approved: true, status: 'Captured', actions: [{ response_code: '10000' }] }));
        assert.isTrue(ckoHelper.redirectPaymentSuccess({ approved: true, status: 'Authorized', actions: [{ response_code: '10000' }] }));
    });

    it('does not count a payment voided or refunded since, though its last action was accepted', function() {
        assert.isFalse(ckoHelper.redirectPaymentSuccess({ approved: true, status: 'Voided', actions: [{ response_code: '10000', type: 'Void' }] }));
        assert.isFalse(ckoHelper.redirectPaymentSuccess({ approved: true, status: 'Refunded', actions: [{ response_code: '10000', type: 'Refund' }] }));
        assert.isFalse(ckoHelper.redirectPaymentSuccess({ approved: false, status: 'Declined', actions: [{ response_code: '10000' }] }));
    });
});

describe('APM: only an enabled APM for the currency and country; a pending one is not exported', function() {
    var apmHelper;
    var filters;

    beforeEach(function() {
        filters = {
            ideal: { countries: ['NL'], currencies: ['EUR'], enabled: true },
            eps: { countries: ['AT'], currencies: ['EUR'], enabled: false },
            fawry: { countries: ['*'], currencies: ['EGP'], enabled: true },
        };
        apmHelper = proxyquire(CARTRIDGE + '/scripts/helpers/apmHelper', {
            'dw/order/OrderMgr': {},
            'dw/system/Transaction': {},
            'dw/web/URLUtils': { url: function() { return ''; } },
            '*/cartridge/scripts/helpers/ckoHelper': { updateCustomerData: function() {} },
            '*/cartridge/config/constants': constants,
            '*/cartridge/config/ckoApmConfig': { idealAuthorization: function() {}, epsAuthorization: function() {}, fawryAuthorization: function() {}, oxxoAuthorization: function() {} },
            '*/cartridge/config/ckoApmFilterConfig': filters,
        });
    });

    it('accepts an enabled APM for its currency and country', function() {
        assert.isTrue(apmHelper.isApmAvailable('ideal', 'EUR', 'NL'));
        assert.isTrue(apmHelper.isApmAvailable('fawry', 'EGP', 'EG'));
    });

    it('refuses a disabled, unlisted or unknown APM, or one for another currency or country', function() {
        assert.isFalse(apmHelper.isApmAvailable('eps', 'EUR', 'AT'), 'disabled');
        assert.isFalse(apmHelper.isApmAvailable('oxxo', 'MXN', 'MX'), 'not offered');
        assert.isFalse(apmHelper.isApmAvailable('ideal', 'GBP', 'NL'), 'currency');
        assert.isFalse(apmHelper.isApmAvailable('ideal', 'EUR', 'GB'), 'country');
        ['constructor', '__proto__', 'toString', '', null].forEach(function(type) {
            assert.isFalse(apmHelper.isApmAvailable(type, 'EUR', 'NL'), String(type));
        });
    });

    it('a pending payment without a redirect is placed awaiting payment; a declined one is an error', function() {
        var pending = apmHelper.handleResponse({ id: 'pay_1', status: 'Pending' }, '00001');
        var declined = apmHelper.handleResponse({ id: 'pay_1', status: 'Declined', approved: false }, '00001');
        var captured = apmHelper.handleResponse({ id: 'pay_1', status: 'Captured', approved: true }, '00001');
        var redirect = apmHelper.handleResponse({ id: 'pay_1', status: 'Pending', _links: { redirect: { href: 'https://pay' } } }, '00001');

        assert.deepEqual([pending.error, pending.awaitingPayment], [false, true]);
        assert.isTrue(declined.error);
        assert.deepEqual([captured.error, !!captured.awaitingPayment], [false, false]);
        assert.deepEqual([redirect.error, redirect.redirectUrl, !!redirect.awaitingPayment], [false, 'https://pay', false]);
    });
});

describe('Klarna: the payment must pay the order; OnApprove acts only on a Klarna order', function() {
    var orderGuard = loadOrderGuard();

    /**
     * @param {Object} readBack The payment Checkout.com returns for it
     * @param {Object} order The order
     * @returns {Object} The result and the reversal spy
     */
    function authorize(readBack, order) {
        var reversePayment = sinon.spy();
        var helper = proxyquire(CARTRIDGE + '/scripts/helpers/klarnaHelper', {
            'dw/order/OrderMgr': { getOrder: function() { return order; } },
            'dw/system/Logger': log,
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; } }; } },
            '*/cartridge/scripts/helpers/ckoHelper': Object.assign({
                getHost: function() { return ''; },
                formatCustomerIP: function() { return ''; },
                getCustomer: function() { return {}; },
                getValue: function() { return false; },
                getMetadata: function() { return {}; },
                log: function() {},
                _: function(key) { return key; },
                paymentResponseValidation: function(response) { return !!response && !!response.reference; },
                gatewayClientRequest: function(service) { return service.indexOf('verify') !== -1 ? readBack : { id: 'pay_1', reference: '00001' }; },
            }, ckoHelperFake),
            '*/cartridge/scripts/helpers/orderGuard': Object.assign({}, orderGuard, { reversePayment: reversePayment }),
            '*/cartridge/config/constants': constants,
        });

        return { result: helper.handleRequest(JSON.stringify({ paymentContext_id: 'pct_1' }), 'CHECKOUTCOM_KLARNA', '00001'), reversePayment: reversePayment };
    }

    it('accepts a payment for the order\'s amount and currency', function() {
        var run = authorize({ id: 'pay_1', reference: '00001', approved: true, status: 'Authorized', amount: 4500, currency: 'EUR' }, makeOrder());

        assert.isFalse(run.result.error);
    });

    it('refuses, and releases, a payment in another currency for the same amount', function() {
        var run = authorize({ id: 'pay_1', reference: '00001', approved: true, status: 'Authorized', amount: 4500, currency: 'SEK' }, makeOrder());

        assert.isTrue(run.result.error);
        assert.isTrue(run.reversePayment.calledOnce);
    });

    it('uses the currency\'s minor units: a zero-decimal currency is not multiplied by 100', function() {
        var jpy = makeOrder({ total: 4500, currency: 'JPY' });
        var helper = Object.assign({}, ckoHelperFake);

        ckoHelperFake.getAmount = function() { return '4500'; };
        try {
            assert.isFalse(authorize({ id: 'pay_1', reference: '00001', approved: true, status: 'Authorized', amount: 4500, currency: 'JPY' }, jpy).result.error);
        } finally {
            ckoHelperFake.getAmount = helper.getAmount;
        }
    });

    it('OnApprove refuses the shopper\'s own order when it is not paid with Klarna, without authorizing it', function() {
        var routes = {};
        var handlePayments = sinon.spy();
        var order = makeOrder({ methods: ['CHECKOUTCOM_FLOW'] });

        proxyquire(CARTRIDGE + '/controllers/CKOKlarna', {
            server: {
                get: function(name) { routes[name] = arguments[arguments.length - 1]; },
                post: function(name) { routes[name] = arguments[arguments.length - 1]; },
                middleware: { https: function() {} },
                exports: function() { return routes; },
            },
            'dw/order/BasketMgr': {},
            'dw/order/OrderMgr': { getOrder: function() { return order; } },
            'dw/system/Logger': log,
            'dw/system/Site': {},
            'dw/web/Resource': { msg: function(key) { return key; } },
            'dw/web/URLUtils': { url: function() { return ''; } },
            '*/cartridge/scripts/checkout/checkoutHelpers': { handlePayments: handlePayments },
            '*/cartridge/scripts/helpers/addressHelpers': {},
            '*/cartridge/scripts/helpers/ckoHelper': {},
            '*/cartridge/scripts/helpers/hooks': function() {},
            '*/cartridge/scripts/helpers/orderGuard': { isPlaced: function() { return false; }, isOpen: function() { return true; }, reload: function(o) { return o; } },
            '*/cartridge/scripts/hooks/fraudDetection': {},
            '*/cartridge/scripts/middleware/csrf': { validateAjaxRequest: function() {} },
            '*/cartridge/config/constants': constants,
        });

        var body = null;

        routes.OnApprove({ form: { orderID: '00001' }, currentCustomer: { raw: { getID: function() { return 'shopper'; } } } }, { json: function(data) { body = data; } }, function() {});

        assert.isTrue(body.error);
        assert.isFalse(handlePayments.called);
    });
});

describe('Tabby: a payment context is charged only for the order total it was created for', function() {
    var originalSession;

    beforeEach(function() {
        originalSession = global.session;
        global.session = { privacy: { ckoTabbyContextId: 'pct_1', ckoTabbyPaymentType: 'Installment', ckoTabbyContextAmount: '4500', ckoTabbyContextCurrency: 'SAR' } };
    });

    afterEach(function() {
        global.session = originalSession;
    });

    /**
     * @param {Object} order The order
     * @returns {Object} The result and the payment request spy
     */
    function authorize(order) {
        var handleRequest = sinon.stub().returns({ error: false, transactionID: 'pay_1', redirectUrl: 'https://tabby' });
        var processor = proxyquire(CARTRIDGE + '/scripts/hooks/payment/processor/CHECKOUTCOM_TABBY', {
            'dw/order/OrderMgr': { getOrder: function() { return order; } },
            'dw/system/Transaction': { wrap: function(fn) { fn(); } },
            '*/cartridge/scripts/helpers/ckoHelper': Object.assign({ getPaymentFailureMessage: function() { return 'failed'; } }, ckoHelperFake),
            '*/cartridge/scripts/helpers/tabbyHelper': { handleRequest: handleRequest },
            '*/cartridge/config/constants': constants,
        });
        var instrument = { paymentTransaction: { setPaymentProcessor: function() {}, setTransactionID: function() {} } };

        return { result: processor.Authorize('00001', instrument, { ID: 'CHECKOUTCOM_TABBY' }), handleRequest: handleRequest };
    }

    it('charges the context when the order total is still the one it was created for', function() {
        var run = authorize(makeOrder({ total: 45, currency: 'SAR' }));

        assert.isFalse(run.result.error);
        assert.isTrue(run.handleRequest.calledOnce);
    });

    it('refuses to charge a context created for less than the order now totals', function() {
        var run = authorize(makeOrder({ total: 145, currency: 'SAR' }));

        assert.isTrue(run.result.error);
        assert.isFalse(run.handleRequest.called);
    });
});
