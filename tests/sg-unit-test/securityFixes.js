'use strict';

/**
 * SiteGenesis (int_checkoutcom): the order being paid is the session's own,
 * never one named by the request; an order is placed only on a payment that
 * pays it; webhooks need the configured key; the Google Pay confirmation shows
 * only the session's order; only enabled APMs can be used.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom/cartridge';
var constants = require(CARTRIDGE + '/config/constants');
var ckoCurrencyConfig = require(CARTRIDGE + '/config/ckoCurrencyConfig');

var log = { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; } };
var ORDER_STATUS = { CREATED: 0, NEW: 3, OPEN: 4, FAILED: 8 };

/**
 * @param {Object} prefs Site preferences
 * @returns {Object} The ckoHelper module
 */
function loadHelper(prefs) {
    return proxyquire(CARTRIDGE + '/scripts/helpers/ckoHelper', {
        '*/cartridge/config/ckoCurrencyConfig': ckoCurrencyConfig,
        '*/cartridge/config/ckoMadaConfig': {},
        '*/cartridge/config/constants': constants,
        '*/cartridge/scripts/helpers/sensitiveDataHelper.js': {},
        'dw/object/SystemObjectMgr': {},
        'dw/order/OrderMgr': {},
        'dw/order/PaymentMgr': {},
        'dw/system/Logger': log,
        'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function(key) { return (prefs || {})[key] || null; } }; } },
        'dw/system/Transaction': {},
        'dw/util/Locale': {},
        'dw/web/Resource': {},
    });
}

/**
 * @param {Object} [options] orderNo, total, currency, status
 * @returns {Object} An order fake
 */
function makeOrder(options) {
    var opts = options || {};
    var state = { status: opts.status === undefined ? ORDER_STATUS.CREATED : opts.status, exportStatus: 1 };

    return {
        state: state,
        orderNo: opts.orderNo || '00001',
        totalGrossPrice: { value: opts.total === undefined ? 45 : opts.total },
        customer: { authenticated: true },
        getOrderNo: function() { return opts.orderNo || '00001'; },
        getCurrencyCode: function() { return opts.currency || 'EUR'; },
        getStatus: function() { return { getValue: function() { return state.status; } }; },
        getExportStatus: function() { return { getValue: function() { return state.exportStatus; } }; },
        setExportStatus: function(value) { state.exportStatus = value; },
        getPaymentInstruments: function() { return { toArray: function() { return []; } }; },
    };
}

describe('SiteGenesis ckoHelper', function() {
    var originalSession;
    var originalRequest;
    var originalEmpty;

    beforeEach(function() {
        originalSession = global.session;
        originalRequest = global.request;
        originalEmpty = global.empty;
        global.session = { privacy: { ckoOrderId: '00001' } };
        global.request = {
            httpParameterMap: { get: function(key) { return { stringValue: key === 'reference' ? '00666' : null }; } },
            httpHeaders: { get: function() { return null; } },
        };
        global.empty = function(value) { return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0); };
    });

    afterEach(function() {
        global.session = originalSession;
        global.request = originalRequest;
        global.empty = originalEmpty;
    });

    it('getOrderId is the session\'s order, whatever the request\'s reference parameter says', function() {
        assert.equal(loadHelper().getOrderId(), '00001');
    });

    it('an order\'s amount is in its own currency (zero- and three-decimal currencies included)', function() {
        var helper = loadHelper();

        assert.equal(helper.getAmount(makeOrder({ total: 45, currency: 'EUR' })), '4500');
        assert.equal(helper.getAmount(makeOrder({ total: 4500, currency: 'JPY' })), '4500');
        assert.equal(helper.getAmount(makeOrder({ total: 4.5, currency: 'KWD' })), '4500');
    });

    it('webhooks: refused without a configured key, without the header, or with another key', function() {
        var header = null;

        global.request.httpHeaders = { get: function() { return header; } };
        assert.isFalse(loadHelper({}).isValidResponse(), 'no key, no header');

        var helper = loadHelper({ ckoMode: 'sandbox', ckoSandboxABCPrivateSharedKey: 'psk_right', ckoSandboxNASEnabled: 'ABC' });
        var keys = helper.getAccountKeys();

        helper.getAccountKeys = function() { return { privateSharedKey: keys.privateSharedKey || 'psk_right' }; };
        assert.isFalse(helper.isValidResponse(), 'no header');
        header = 'psk_wrong';
        assert.isFalse(helper.isValidResponse(), 'another key');
        header = 'psk_right';
        assert.isTrue(helper.isValidResponse(), 'the key');
    });

    it('a first payment response: a decline or a bare reference is never a success', function() {
        var helper = loadHelper();

        assert.isFalse(helper.paymentSuccess({ id: 'pay_1', reference: '00001', approved: false, status: 'Declined', response_code: '20051' }));
        assert.isFalse(helper.paymentSuccess({ id: 'pay_1', reference: '00001' }), 'bare reference');
        assert.isFalse(helper.paymentSuccess({ id: 'pay_1', status: 'Expired', source: { type: 'boleto' } }));
        assert.isTrue(helper.paymentSuccess({ id: 'pay_1', reference: '00001', status: 'Pending', _links: { redirect: { href: 'https://3ds' } } }), 'a redirect, verified on return');
        assert.isTrue(helper.paymentSuccess({ id: 'pay_1', approved: true, status: 'Authorized', response_code: '10000' }));
    });

    it('paysOrder: only the order\'s own payment, approved, paid, for its amount and currency', function() {
        var helper = loadHelper();
        var order = makeOrder();
        var paid = function(overrides) { return Object.assign({ id: 'pay_1', reference: '00001', approved: true, status: 'Captured', amount: 4500, currency: 'EUR' }, overrides); };

        assert.isTrue(helper.paysOrder(order, paid()));
        assert.isFalse(helper.paysOrder(order, paid({ reference: '00002' })), 'another order');
        assert.isFalse(helper.paysOrder(order, paid({ amount: 100 })), 'a cheaper payment');
        assert.isFalse(helper.paysOrder(order, paid({ currency: 'JPY' })), 'another currency');
        ['Declined', 'Expired', 'Voided', 'Refunded', 'Canceled'].forEach(function(status) {
            assert.isFalse(helper.paysOrder(order, paid({ status: status })), status);
        });
        assert.isFalse(helper.paysOrder(order, paid({ status: 'Pending' })));
        assert.isTrue(helper.paysOrder(order, paid({ status: 'Pending' }), { allowPending: true }));
    });
});

describe('SiteGenesis CKOMain-HandleReturn: the session\'s order, on a payment that pays it', function() {
    var originalSession;
    var originalRequest;
    var orders;
    var verified;
    var submit;
    var summary;
    var failOrder;
    var getOrder;
    var controller;

    beforeEach(function() {
        originalSession = global.session;
        originalRequest = global.request;
        global.session = { privacy: { ckoOrderId: '00001' } };
        global.request = { httpParameterMap: { get: function(key) { return { stringValue: key === 'cko-session-id' ? 'sid_1' : '00002' }; } } };
        orders = { '00001': makeOrder({ orderNo: '00001' }), '00002': makeOrder({ orderNo: '00002', total: 900 }) };
        verified = { id: 'pay_1', reference: '00001', approved: true, status: 'Captured', amount: 4500, currency: 'EUR' };
        submit = sinon.stub().returns({ error: false });
        summary = { Start: sinon.spy(), ShowConfirmation: sinon.spy() };
        failOrder = sinon.spy();
        getOrder = sinon.spy(function(orderNo) { return orders[orderNo] || null; });

        var helper = loadHelper();

        helper.gatewayClientRequest = function() { return verified; };
        helper.getValue = function() { return 'sandbox'; };

        controller = proxyquire(CARTRIDGE + '/controllers/CKOMain', {
            '*/cartridge/scripts/app': {
                getModel: function(name) { return name === 'Order' ? { submit: submit } : {}; },
                getController: function() { return summary; },
                getView: function() { return { render: function() {} }; },
            },
            '*/cartridge/scripts/guard': { ensure: function(filters, fn) { return fn; } },
            '*/cartridge/scripts/util/Response': {},
            '*/cartridge/scripts/helpers/ckoHelper': helper,
            '*/cartridge/scripts/helpers/eventsHelper': {},
            '*/cartridge/config/ckoApmFilterConfig': {},
            '*/cartridge/config/ckoMadaConfig': {},
            '*/cartridge/config/constants': constants,
            'dw/template/ISML': {},
            'dw/order/OrderMgr': { getOrder: getOrder, failOrder: failOrder },
            'dw/order/BasketMgr': {},
            'dw/order/Order': { ORDER_STATUS_CREATED: ORDER_STATUS.CREATED, ORDER_STATUS_FAILED: ORDER_STATUS.FAILED, EXPORT_STATUS_NOTEXPORTED: 0 },
            'dw/system/Transaction': { wrap: function(fn) { return fn(); } },
            'dw/system/Status': function() {},
            'dw/system/Logger': log,
            'dw/util/Locale': {},
        });
    });

    afterEach(function() {
        global.session = originalSession;
        global.request = originalRequest;
    });

    it('places the session\'s order on its own captured payment', function() {
        controller.HandleReturn();

        assert.isTrue(submit.calledOnceWith(orders['00001']));
        assert.isTrue(summary.ShowConfirmation.calledOnce);
    });

    it('never reads, places or fails the order the URL names (reference=00002)', function() {
        verified = { id: 'pay_9', reference: '00002', approved: true, status: 'Captured', amount: 90000, currency: 'EUR' };
        controller.HandleReturn();

        assert.isFalse(getOrder.calledWith('00002'));
        assert.isFalse(submit.called);
        assert.isTrue(failOrder.neverCalledWith(orders['00002']));
    });

    it('does not place the order on a cheaper payment, a declined or an expired one', function() {
        [{ amount: 100 }, { status: 'Declined', approved: false }, { status: 'Expired' }].forEach(function(change) {
            verified = Object.assign({ id: 'pay_1', reference: '00001', approved: true, status: 'Captured', amount: 4500, currency: 'EUR' }, change);
            controller.HandleReturn();
        });

        assert.isFalse(submit.called);
    });

    it('a pending payment places the order without releasing it for export', function() {
        verified.status = 'Pending';
        controller.HandleReturn();

        assert.isTrue(submit.calledOnce);
        assert.equal(orders['00001'].state.exportStatus, 0);
    });
});

describe('SiteGenesis Google Pay RedirectRoute: only the session\'s order', function() {
    var originalSession;
    var originalRequest;
    var originalResponse;

    afterEach(function() {
        global.session = originalSession;
        global.request = originalRequest;
        global.response = originalResponse;
    });

    ['CartPageGoogle', 'PDPGooglePay'].forEach(function(name) {
        it(name + ' redirects to the cart instead of showing another order\'s confirmation', function() {
            originalSession = global.session;
            originalRequest = global.request;
            originalResponse = global.response;
            global.session = { privacy: { ckoOrderId: '00001' } };
            global.request = { httpQueryString: '00002' };
            global.response = { redirect: sinon.spy() };

            var render = sinon.spy();
            var controller = proxyquire(CARTRIDGE + '/controllers/' + name, {
                '*/cartridge/scripts/app': {
                    getModel: function() { return {}; },
                    getForm: function() { return { setValue: function() {}, clear: function() {} }; },
                    getView: function() { return { render: render }; },
                },
                '*/cartridge/scripts/guard': { ensure: function(filters, fn) { return fn; } },
                '*/cartridge/scripts/util/Response': {},
                'dw/order/BasketMgr': {},
                'dw/order/OrderMgr': { getOrder: function(orderNo) { return makeOrder({ orderNo: orderNo }); } },
                'dw/order/ShippingMgr': {},
                'dw/system/Transaction': {},
                'dw/util/HashMap': function() {},
                'dw/web/URLUtils': { url: function(route) { return route; }, https: function(route) { return route; } },
            });

            controller.RedirectRoute();

            assert.isFalse(render.called);
            assert.isTrue(global.response.redirect.calledOnceWith('Cart-Show'));
        });
    });
});

describe('SiteGenesis APM: only an enabled APM for the order\'s currency', function() {
    var originalRequest;

    beforeEach(function() {
        originalRequest = global.request;
        global.request = { getLocale: function() { return 'nl_NL'; } };
    });

    afterEach(function() {
        global.request = originalRequest;
    });

    /**
     * @param {string} apm The posted APM
     * @param {Object} prefs Site preferences
     * @param {string} currency The order currency
     * @returns {Object} The authorization result and the request spy
     */
    function authorize(apm, prefs, currency) {
        var apmAuthorization = sinon.stub().returns({ redirected: true, redirectUrl: 'https://pay' });
        var processor = proxyquire(CARTRIDGE + '/scripts/payment/processor/CHECKOUTCOM_APM', {
            'dw/system/Transaction': {},
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function(key) { return !!prefs[key]; } }; } },
            'dw/util/Locale': { getLocale: function() { return { getCountry: function() { return 'NL'; } }; } },
            '*/cartridge/scripts/models/CartModel': {},
            '*/cartridge/scripts/app': { getForm: function() { return { get: function() { return { value: function() { return apm; } }; } }; } },
            '*/cartridge/scripts/helpers/apmHelper': { apmAuthorization: apmAuthorization },
            '*/cartridge/config/ckoApmConfig': { idealPayAuthorization: function() { return {}; }, epsPayAuthorization: function() { return {}; } },
            '*/cartridge/config/ckoApmFilterConfig': { ideal: { countries: ['NL'], currencies: ['EUR'] }, eps: { countries: ['AT'], currencies: ['EUR'] } },
        });

        return { result: processor.Authorize({ OrderNo: '00001', Order: makeOrder({ currency: currency }) }), apmAuthorization: apmAuthorization };
    }

    var savedSession;

    beforeEach(function() {
        savedSession = global.session;
        global.session = { privacy: {} };
    });

    afterEach(function() {
        global.session = savedSession;
    });

    it('authorizes an enabled APM for the order\'s currency', function() {
        var run = authorize('ideal', { ckoIdealEnabled: true }, 'EUR');

        assert.equal(run.result.redirectURL, 'https://pay');
    });

    it('refuses a disabled, unknown or other-currency APM without calling Checkout.com', function() {
        [['eps', {}, 'EUR'], ['constructor', { ckoIdealEnabled: true }, 'EUR'], ['ideal', { ckoIdealEnabled: true }, 'GBP']].forEach(function(args) {
            var run = authorize(args[0], args[1], args[2]);

            assert.isTrue(run.result.error, args.join(' '));
            assert.isFalse(run.apmAuthorization.called, args.join(' '));
        });
    });
});
