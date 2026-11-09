'use strict';

/**
 * PayPal payment contexts: only a pct_ id the shopper's own session created is
 * read back, and it can only name a payment context (no path or query of its own
 * on a request signed with the secret key). Card security code: held in the
 * session for the authorization, never stored on the basket or order.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var constants = require(CARTRIDGE + '/config/constants');

/**
 * A session.privacy like the platform's: it keeps strings, numbers and booleans;
 * anything else is stored as its string form.
 * @returns {Object} The privacy scope
 */
function privacyScope() {
    var values = {};

    return new Proxy(values, {
        set: function(target, key, value) {
            target[key] = (value === null || ['string', 'number', 'boolean'].indexOf(typeof value) !== -1) ? value : String(value);

            return true;
        },
    });
}

describe('PayPal payment contexts: the service URL', function() {
    var services;
    var wrapper;

    beforeEach(function() {
        services = [];
        wrapper = proxyquire(CARTRIDGE + '/scripts/services/paymentContexts', {
            'dw/svc/LocalServiceRegistry': {
                createService: function(id, callbacks) {
                    services.push(callbacks);

                    return callbacks;
                },
            },
            '*/cartridge/scripts/helpers/ckoHelper': {
                getServiceEndpoint: function() { return null; },
                getAccountKeys: function() { return { secretKey: 'sk_sbox_test' }; },
                redactServiceLog: function(value) { return value; },
                getCartridgeMeta: function() { return 'SFRA'; },
            },
            '*/cartridge/config/constants': constants,
        });
    });

    /**
     * Run a service's createRequest.
     * @param {string} mode sandbox or live
     * @param {Object} args The call arguments
     * @returns {Object} The URL and method set on the service
     */
    function request(mode, args) {
        var svc = {
            configuration: { credential: { URL: 'https://api.sandbox.checkout.com/payment-contexts' } },
            setURL: sinon.spy(),
            setRequestMethod: sinon.spy(),
            addHeader: function() {},
        };

        wrapper[mode]('cko.payment.contexts.' + mode + '.service').createRequest(svc, args);

        return { url: svc.setURL.firstCall && svc.setURL.firstCall.args[0], method: svc.setRequestMethod.firstCall && svc.setRequestMethod.firstCall.args[0], svc: svc };
    }

    ['sandbox', 'live'].forEach(function(mode) {
        it(mode + ': reads back only a payment context, by its pct_ id', function() {
            assert.deepEqual(
                (function(r) { return [r.url, r.method]; }(request(mode, { id: 'pct_abc123', isPayPalApprove: true }))),
                ['https://api.sandbox.checkout.com/payment-contexts/pct_abc123', 'GET']
            );
        });

        it(mode + ': refuses any other id before a request is made (no path traversal, no query)', function() {
            ['../payments?reference=00001234', 'pct_1/../../payments', 'pct_1?x=1', 'pay_123', '', null].forEach(function(id) {
                var svc = { configuration: { credential: { URL: 'https://api.sandbox.checkout.com/payment-contexts' } }, setURL: sinon.spy(), setRequestMethod: sinon.spy(), addHeader: sinon.spy() };

                assert.throws(function() {
                    wrapper[mode]('cko.payment.contexts.' + mode + '.service').createRequest(svc, { id: id, isPayPalApprove: true });
                });
                assert.isFalse(svc.setURL.called, 'no URL for ' + id);
                assert.isFalse(svc.addHeader.called, 'no secret key for ' + id);
            });
        });

        it(mode + ': creating a context (PayPal, Klarna, Tabby) still posts to the service URL', function() {
            var r = request(mode, { amount: 4500 });

            assert.equal(r.url, 'https://api.sandbox.checkout.com/payment-contexts');
            assert.equal(r.method, 'POST');
        });
    });
});

describe('PayPal controller: a payment context is read back only by the session that created it', function() {
    var routes;
    var calls;
    var originalSession;
    var originalEmpty;

    /**
     * Load the controller with a fake server that records the routes.
     */
    function loadController() {
        routes = {};
        calls = [];
        var server = {
            get: function(name) { routes[name] = arguments[arguments.length - 1]; },
            post: function(name) { routes[name] = arguments[arguments.length - 1]; },
            exports: function() { return routes; },
        };

        proxyquire(CARTRIDGE + '/controllers/PayPal', {
            server: server,
            'dw/order/BasketMgr': {
                getCurrentBasket: function() {
                    return {
                        totalGrossPrice: { value: 45 },
                        adjustedShippingTotalGrossPrice: { value: 5 },
                        shipments: [{ shippingAddress: { firstName: 'A', address1: '1 St', city: 'London', stateCode: '', postalCode: 'N1', countryCode: { value: 'GB' } } }],
                        allProductLineItems: { toArray: function() { return []; } },
                    };
                },
            },
            '*/cartridge/scripts/helpers/ckoHelper': {
                getValue: function() { return 'sandbox'; },
                restoreBasket: sinon.spy(),
                createContext: function(serviceId, args, method) {
                    calls.push({ args: args, method: method });

                    if (method === 'POST') {
                        return { status: 'OK', object: { id: 'pct_mine', partner_metadata: { order_id: 'PP-1' } } };
                    }

                    return { status: 'OK', object: { id: args.id, status: 'Created', amount: 4500, currency: 'GBP', customer: { email: 'shopper@example.com' }, payment_request: { shipping: { address: {} } } } };
                },
            },
            '*/cartridge/scripts/helpers/orderGuard': {},
            '*/cartridge/scripts/middleware/csrf': { validateAjaxRequest: function() {} },
            '*/cartridge/config/constants': constants,
            '*/cartridge/scripts/helpers/payPalHelper': {},
            '*/cartridge/scripts/helpers/hooks': function() {},
            '*/cartridge/scripts/checkout/checkoutHelpers': {},
            'dw/web/URLUtils': {},
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; } }; } },
            'dw/web/Resource': { msg: function(key) { return key; } },
        });
    }

    /**
     * Run a route.
     * @param {string} name The route
     * @param {Object} req The request
     * @returns {Object} The JSON response
     */
    function run(name, req) {
        var body = null;

        routes[name](req, { json: function(data) { body = data; } }, function() {});

        return body;
    }

    beforeEach(function() {
        originalSession = global.session;
        originalEmpty = global.empty;
        global.session = { privacy: privacyScope(), getCurrency: function() { return { getCurrencyCode: function() { return 'GBP'; } }; } };
        global.empty = function(value) { return value === null || value === undefined || value === '' || (typeof value === 'object' && Object.keys(value).length === 0); };
        loadController();
    });

    afterEach(function() {
        global.session = originalSession;
        global.empty = originalEmpty;
    });

    it('CreateOrder binds the new context to the session, as a plain value', function() {
        var created = run('CreateOrder', { form: {} });

        assert.equal(created.id, 'pct_mine');
        assert.strictEqual(global.session.privacy.ckoPayPalContextId, 'pct_mine');
    });

    it('OnApprove reads back the session\'s own context, and returns only its id and status', function() {
        run('CreateOrder', { form: {} });
        var approved = run('OnApprove', { querystring: { id: 'pct_mine' } });

        assert.deepEqual(approved, { success: true, response: { id: 'pct_mine', status: 'Created' } });
    });

    it('OnApprove refuses another session\'s context, or any id when none was created, without calling Checkout.com', function() {
        assert.isTrue(run('OnApprove', { querystring: { id: 'pct_someone_else' } }).error);

        run('CreateOrder', { form: {} });
        calls = [];
        assert.isTrue(run('OnApprove', { querystring: { id: 'pct_someone_else' } }).error);
        assert.isTrue(run('OnApprove', { querystring: { id: '../payments?reference=00001234' } }).error);
        assert.lengthOf(calls, 0);
    });

    it('ExpressCheckout refuses a context the session did not create, without calling Checkout.com', function() {
        run('CreateOrder', { form: {} });
        calls = [];
        var result = run('ExpressCheckout', { form: { paymentContextId: 'pct_someone_else' } });

        assert.isTrue(result.error);
        assert.equal(result.message, 'error.paypal.invalid.context');
        assert.lengthOf(calls, 0);
    });
});

describe('Card security code: held in the session for the authorization, never stored', function() {
    var originalSession;
    var cardHelper;

    beforeEach(function() {
        originalSession = global.session;
        global.session = { privacy: privacyScope() };
        cardHelper = proxyquire(CARTRIDGE + '/scripts/helpers/cardHelper', {
            'dw/order/OrderMgr': {},
            'dw/web/URLUtils': {},
            'dw/system/Site': {},
            '*/cartridge/scripts/helpers/ckoHelper': {},
            '*/cartridge/config/constants': constants,
        });
    });

    afterEach(function() {
        global.session = originalSession;
    });

    /**
     * A payment instrument as Handle leaves it.
     * @param {Object} paymentData The stored payment data
     * @returns {Object} The instrument
     */
    function instrument(paymentData) {
        return {
            custom: { ckoPaymentData: JSON.stringify(paymentData) },
            creditCardToken: 'src_saved',
            creditCardNumber: '4242424242424242',
            creditCardExpirationMonth: 12,
            creditCardExpirationYear: 2030,
            creditCardHolder: 'A Shopper',
        };
    }

    it('sends the held CVV with a new card, then forgets it', function() {
        cardHelper.holdSecurityCode('123');
        var source = cardHelper.getCardSource(instrument({ saveCard: false }));

        assert.equal(source.type, 'card');
        assert.equal(source.cvv, '123');
        assert.isNull(global.session.privacy.ckoCardSecurityCode);
    });

    it('sends the held CVV with a saved card (its source id), as before', function() {
        cardHelper.holdSecurityCode('456');
        var source = cardHelper.getCardSource(instrument({ saveCard: true }));

        assert.deepEqual([source.type, source.id, source.cvv], ['id', 'src_saved', '456']);
    });

    it('still authorizes a basket from before the change, whose payment data has the CVV', function() {
        var source = cardHelper.getCardSource(instrument({ saveCard: true, securityCode: '789' }));

        assert.deepEqual([source.type, source.cvv], ['id', '789']);
    });

    it('Handle stores no security code in the payment data', function() {
        var fs = require('fs');
        var path = require('path');
        var source = fs.readFileSync(path.join(__dirname, CARTRIDGE, 'scripts/hooks/payment/processor/CHECKOUTCOM_CARD.js'), 'utf8');
        var stored = source.match(/paymentInstrument\.custom\.ckoPaymentData = JSON\.stringify\(\{[\s\S]*?\}\);/);

        assert.isNotNull(stored);
        assert.notInclude(stored[0], 'securityCode');
        assert.include(source, 'cardHelper.holdSecurityCode(cardSecurityCode);');
    });

    it('Authorize forgets the held CVV even when the authorization fails', function() {
        var takeSecurityCode = sinon.spy();
        var processor = proxyquire(CARTRIDGE + '/scripts/hooks/payment/processor/CHECKOUTCOM_CARD', {
            server: {},
            '*/cartridge/scripts/util/collections': {},
            'dw/order/PaymentInstrument': {},
            'dw/order/PaymentMgr': {},
            'dw/order/PaymentStatusCodes': {},
            'dw/web/Resource': { msg: function(key) { return key; } },
            'dw/system/Transaction': { wrap: function(fn) { fn(); } },
            'dw/system/Site': {},
            '*/cartridge/scripts/helpers/ckoHelper': {},
            '*/cartridge/scripts/helpers/orderGuard': { recordTransaction: function() {} },
            '*/cartridge/scripts/helpers/cardHelper': {
                handleRequest: function() { throw new Error('gateway down'); },
                takeSecurityCode: takeSecurityCode,
            },
            '*/cartridge/config/constants': constants,
        });
        var result = processor.Authorize('00001234', { custom: { ckoPaymentData: '{}' } }, {});

        assert.isTrue(result.error);
        assert.isTrue(takeSecurityCode.calledOnce);
    });
});
