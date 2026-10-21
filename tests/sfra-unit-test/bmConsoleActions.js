'use strict';

/**
 * Business Manager console (bm_checkoutcom): capture, void and refund requests
 * must come from the console page (POST + CSRF token), only report success when
 * Checkout.com accepted the action, and send amounts in Checkout.com's format.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var BM = '../../Cartridges/bm_checkoutcom/cartridge';
var constants = require(BM + '/config/constants');
var ckoCurrencyConfig = require(BM + '/config/ckoCurrencyConfig');

/**
 * Load CKOHelper with dw fakes.
 * @param {Object} services Service module fakes, by file name
 * @returns {Object} The helper
 */
function loadHelper(services) {
    var stubs = {
        'dw/order/OrderMgr': {},
        'dw/order/PaymentMgr': {},
        'dw/order/PaymentTransaction': {},
        'dw/web/Resource': { msg: function(key) { return key; } },
        'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; } },
        'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; } }; } },
        '*/cartridge/config/ckoCurrencyConfig': ckoCurrencyConfig,
        '*/cartridge/config/constants': constants,
    };

    Object.keys(services || {}).forEach(function(name) {
        stubs['*/cartridge/scripts/services/' + name] = services[name];
    });

    return proxyquire(BM + '/scripts/helpers/CKOHelper', stubs);
}

describe('BM console: amount formats (ckoCurrencyConfig + CKOHelper.getFormattedPrice)', function() {
    var helper = loadHelper();

    it('multiplies most currencies by 100, CLP included', function() {
        assert.equal(helper.getFormattedPrice('45.50', 'GBP'), '4550');
        assert.equal(helper.getFormattedPrice('100', 'CLP'), '10000');
    });

    it('sends full-value currencies as they are, UGX included and CLF not', function() {
        assert.equal(helper.getFormattedPrice('1200', 'JPY'), '1200');
        assert.equal(helper.getFormattedPrice('5000', 'UGX'), '5000');
        assert.equal(helper.getFormattedPrice('10', 'CLF'), '1000');
    });

    it('multiplies three-decimal currencies by 1000, IQD included', function() {
        assert.equal(helper.getFormattedPrice('2.5', 'IQD'), '2500');
        assert.equal(helper.getFormattedPrice('2.5', 'KWD'), '2500');
    });

    it('matches whole currency codes only', function() {
        // "PY" is inside "JPY PYG": a substring match would treat it as full value
        assert.equal(helper.getCkoFormatedValue('PY'), 100);
    });
});

describe('BM console: service lookup (CKOHelper.getService)', function() {
    it('loads the service module for the action and mode', function() {
        var created = { id: 'capture-sandbox' };
        var helper = loadHelper({
            transactionCapture: { sandbox: function() { return created; } },
            klarna_transactionVoid: { live: function() { return { id: 'klarna-void-live' }; } },
        });

        assert.strictEqual(helper.getService('cko.transaction.capture.sandbox.service'), created);
        assert.equal(helper.getService('cko.klarna_transaction.void.live.service').id, 'klarna-void-live');
    });

    it('refuses an unknown service instead of loading a module named after it', function() {
        assert.throws(function() {
            loadHelper().getService('cko.transaction.unknown.sandbox.service');
        }, /Unknown Checkout.com service/);
    });
});

describe('BM console: actions (CKOTransactions-RemoteCall)', function() {
    var output;
    var status;
    var helper;
    var csrfValid;

    /**
     * Run RemoteCall with the given request.
     * @param {Object} req method and parameters
     * @returns {*} The parsed JSON answer
     */
    function remoteCall(req) {
        output = '';
        status = 200;

        global.request = {
            getHttpMethod: function() { return req.method || 'POST'; },
            httpParameterMap: {
                get: function(name) {
                    var value = (req.params || {})[name];

                    return { value: value, stringValue: value === undefined ? null : String(value) };
                },
            },
        };
        global.response = {
            setStatus: function(value) { status = value; },
            writer: { println: function(text) { output += text; } },
        };

        var controller = proxyquire(BM + '/controllers/CKOTransactions', {
            'dw/web/CSRFProtection': { validateRequest: function() { return csrfValid; } },
            'dw/template/ISML': {},
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; }, httpHostName: 'shop.example' }; } },
            'dw/order/OrderMgr': { getOrder: function() { return null; } },
            '*/cartridge/scripts/helpers/CKOHelper': helper,
            '*/cartridge/config/constants': constants,
        });

        controller.RemoteCall();

        return JSON.parse(output);
    }

    beforeEach(function() {
        csrfValid = true;
        helper = {
            getValue: function() { return 'sandbox'; },
            getFormattedPrice: function(amount) { return String(Math.round(parseFloat(amount) * 100)); },
            getNasEnabled: function() { return { value: 'NAS' }; },
            log: function() {},
            _: function(key) { return key; },
            getGatewayClient: sinon.stub().returns({ action_id: 'act_1' }),
        };
    });

    afterEach(function() {
        delete global.request;
        delete global.response;
    });

    var capture = { task: 'capture', amount: '10.00', currency: 'GBP', orderNo: '00001', pid: 'pay_1' };

    it('performs an action requested by the console and returns the accepted response', function() {
        var answer = remoteCall({ params: capture });

        assert.equal(status, 200);
        assert.deepEqual(answer, { action_id: 'act_1' });
        assert.isTrue(helper.getGatewayClient.calledOnce);
    });

    it('refuses a request without a valid CSRF token, without calling Checkout.com', function() {
        csrfValid = false;

        assert.isFalse(remoteCall({ params: capture }));
        assert.equal(status, 403);
        assert.isFalse(helper.getGatewayClient.called);
    });

    it('refuses a GET (a crafted link), without calling Checkout.com', function() {
        assert.isFalse(remoteCall({ method: 'GET', params: capture }));
        assert.equal(status, 403);
        assert.isFalse(helper.getGatewayClient.called);
    });

    it('refuses an unknown task and a missing or negative amount', function() {
        assert.isFalse(remoteCall({ params: Object.assign({}, capture, { task: 'payouts' }) }));
        assert.equal(status, 400);
        assert.isFalse(remoteCall({ params: Object.assign({}, capture, { amount: '-5' }) }));
        assert.isFalse(remoteCall({ params: Object.assign({}, capture, { task: 'refund', amount: '' }) }));
        assert.isFalse(helper.getGatewayClient.called);
    });

    it('reports a failed action as a failure, not as success', function() {
        // The gateway client returns the HTTP error code when the call fails
        helper.getGatewayClient = sinon.stub().returns(422);

        assert.isFalse(remoteCall({ params: Object.assign({}, capture, { task: 'refund' }) }));
    });
});
