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
        'dw/svc/LocalServiceRegistry': {},
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

describe('BM console: actions (CKOTransactionActions-RemoteCall, a module of its own)', function() {
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
            setContentType: function() {},
            writer: { println: function(text) { output += text; } },
        };

        var controller = proxyquire(BM + '/controllers/CKOTransactionActions', {
            'dw/web/CSRFProtection': { validateRequest: function() { return csrfValid; } },
            'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {} }; } },
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; }, httpHostName: 'shop.example' }; } },
            'dw/order/OrderMgr': { getOrder: function(orderNo) { return orders[orderNo] || null; } },
            '*/cartridge/scripts/helpers/CKOHelper': helper,
            '*/cartridge/config/constants': constants,
        });

        controller.RemoteCall();

        return JSON.parse(output);
    }

    var orders;
    var method;

    beforeEach(function() {
        csrfValid = true;
        method = 'CHECKOUTCOM_APM';
        orders = {
            '00001': {
                custom: { orderProcessedByABCorNAS: 'NAS' },
                getOrderNo: function() { return '00001'; },
                getCurrencyCode: function() { return 'EUR'; },
                getPaymentInstruments: function() { return { toArray: function() { return [{ getPaymentMethod: function() { return 'CHECKOUTCOM_APM'; }, custom: {} }]; } }; },
            },
        };
        helper = {
            getOrderPaymentId: function() { return 'pay_order1'; },
            getCkoInstrument: function() { return { getPaymentMethod: function() { return method; } }; },
            getAvailableAmount: sinon.stub().returns(4500),
            getValue: function() { return 'sandbox'; },
            getFormattedPrice: function(amount) { return String(Math.round(parseFloat(amount) * 100)); },
            getNasEnabled: function() { return { value: 'NAS', toString: function() { return 'NAS'; } }; },
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

    it('acts on the order\'s own payment, never the pid of the request', function() {
        remoteCall({ params: Object.assign({}, capture, { pid: 'pay_someone_else' }) });

        assert.equal(helper.getGatewayClient.firstCall.args[1].chargeId, 'pay_order1');
        assert.equal(helper.getGatewayClient.firstCall.args[1].amount, '1000');
    });

    it('refuses an amount above what is still available, without calling Checkout.com', function() {
        helper.getAvailableAmount = sinon.stub().returns(500);

        assert.deepEqual(remoteCall({ params: capture }), { error: 'exceeds_available', limit: 500 });
        assert.equal(status, 422);
        assert.isFalse(helper.getGatewayClient.called);
    });

    it('refuses an unknown order, or an order without a Checkout.com payment', function() {
        assert.deepEqual(remoteCall({ params: Object.assign({}, capture, { orderNo: '00099' }) }), { error: 'no_order' });
        assert.equal(status, 404);

        helper.getOrderPaymentId = function() { return null; };
        assert.deepEqual(remoteCall({ params: capture }), { error: 'no_payment' });
        assert.equal(status, 409);
        assert.isFalse(helper.getGatewayClient.called);
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

    it('refuses an unknown task and a missing, negative or malformed amount', function() {
        assert.isFalse(remoteCall({ params: Object.assign({}, capture, { task: 'payouts' }) }));
        assert.equal(status, 400);

        ['-5', '', '5abc', '1e-9', '1,5', '0.001', '0'].forEach(function(amount) {
            assert.deepEqual(remoteCall({ params: Object.assign({}, capture, { task: 'refund', amount: amount }) }), { error: 'invalid_amount' }, amount);
            assert.equal(status, 400);
        });
        assert.isFalse(helper.getGatewayClient.called);
    });

    it('sends one idempotency key per console dialog, and no amount for a void', function() {
        remoteCall({ params: Object.assign({}, capture, { nonce: 'abc12345' }) });
        assert.equal(helper.getGatewayClient.firstCall.args[1].idempotencyKey, 'bm_00001_capture_abc12345');

        remoteCall({ params: { task: 'void', orderNo: '00001', nonce: 'bad nonce!' } });
        assert.isNull(helper.getGatewayClient.secondCall.args[1].idempotencyKey);
        assert.notProperty(helper.getGatewayClient.secondCall.args[1], 'amount');
    });

    it('blocks capture for a method that has none, by the order\'s Checkout.com payment', function() {
        method = 'CHECKOUTCOM_ALMA';

        assert.deepEqual(remoteCall({ params: capture }), { error: true, message: 'Capture and Void are not supported for Alma payments.' });
        assert.isFalse(helper.getGatewayClient.called);
    });

    it('retries a 403 with the Klarna services only for a Klarna payment', function() {
        helper.getGatewayClient = sinon.stub().returns(403);
        remoteCall({ params: capture });
        assert.isTrue(helper.getGatewayClient.calledOnce);

        method = 'CHECKOUTCOM_KLARNA';
        helper.getGatewayClient = sinon.stub();
        helper.getGatewayClient.onFirstCall().returns(403);
        helper.getGatewayClient.onSecondCall().returns({ action_id: 'act_k' });
        assert.deepEqual(remoteCall({ params: capture }), { action_id: 'act_k' });
        assert.equal(helper.getGatewayClient.secondCall.args[0], 'cko.klarna_transaction.capture.sandbox.service');
    });

    it('reports a failed action as a failure, not as success', function() {
        // The gateway client returns the HTTP error code when the call fails
        helper.getGatewayClient = sinon.stub().returns(422);

        assert.isFalse(remoteCall({ params: Object.assign({}, capture, { task: 'refund' }) }));
    });
});

describe('BM console: transactions list and limits (CKOHelper)', function() {
    var searches;

    /**
     * @param {Object} options orders (search result), query (string), params
     * @returns {Object} CKOHelper with an order search fake
     */
    function helperWith(options) {
        searches = [];
        global.request = {
            httpQueryString: options.query || '',
            httpParameterMap: { get: function(name) { return { stringValue: (options.params || {})[name] || null }; } },
        };

        var orders = options.orders || [];
        var helper = proxyquire(BM + '/scripts/helpers/CKOHelper', {
            'dw/order/OrderMgr': {
                searchOrders: function(query, sort, start, end) {
                    var index = 0;

                    searches.push({ query: query, start: start, end: end });

                    return {
                        getCount: function() { return orders.length; },
                        asList: function(from, size) { return { toArray: function() { return orders.slice(from, from + size); } }; },
                        hasNext: function() { return index < orders.length; },
                        next: function() { return orders[index++]; },
                        close: function() {},
                    };
                },
            },
            'dw/order/PaymentMgr': { getPaymentMethod: function() { return { getPaymentProcessor: function() { return { getID: function() { return 'CHECKOUTCOM_FLOW'; } }; } }; } },
            'dw/order/PaymentTransaction': { TYPE_CAPTURE: 'CAPTURE', TYPE_CREDIT: 'CREDIT' },
            'dw/web/Resource': { msg: function(key) { return key; } },
            'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; } },
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; } }; } },
            'dw/svc/LocalServiceRegistry': {},
            '*/cartridge/config/ckoCurrencyConfig': ckoCurrencyConfig,
            '*/cartridge/config/constants': constants,
        });

        return helper;
    }

    function order(orderNo, instruments) {
        return {
            orderNo: orderNo,
            custom: {},
            getCurrencyCode: function() { return 'EUR'; },
            getTotalGrossPrice: function() { return { value: 45, getValue: function() { return 45; } }; },
            getPaymentInstruments: function() { return { toArray: function() { return instruments; } }; },
        };
    }

    function instrument(transactionId, type, amount) {
        var transaction = {
            transactionID: transactionId,
            getTransactionID: function() { return transactionId; },
            type: { toString: function() { return type || 'AUTH'; }, displayValue: type || 'AUTH' },
            amount: { value: amount || 45, currencyCode: 'EUR' },
            custom: {},
            getCreationDate: function() { return new Date('2026-10-01'); },
        };

        return { getPaymentMethod: function() { return 'CHECKOUTCOM_FLOW'; }, getPaymentTransaction: function() { return transaction; } };
    }

    afterEach(function() {
        delete global.request;
    });

    it('queries Checkout.com orders only, always one page, with a validated year range', function() {
        helperWith({ query: 'year=2025-2027&page=2&size=500' }).getCkoOrders();
        assert.match(searches[0].query, /custom\.orderProcessedByABCorNAS != NULL/);
        assert.equal(searches[0].start.getFullYear(), 2025);
        assert.equal(searches[0].end.getFullYear(), 2027);

        helperWith({ query: 'year=1900-x' }).getCkoOrders();
        assert.equal(searches[0].start.getFullYear(), new Date().getFullYear());
    });

    it('skips an order without a Checkout.com payment instrument instead of failing the list', function() {
        var result = helperWith({ orders: [order('00001', []), order('00002', [instrument('pay_2')])] }).getCkoTransactions();

        assert.lengthOf(result.data, 1);
        assert.equal(result.data[0].order_no, '00002');
    });

    it('finds one transaction by its payment id without loading the list', function() {
        var found = helperWith({ params: { tid: 'pay_2' }, orders: [order('00001', [instrument('pay_1')]), order('00002', [instrument('pay_2')])] }).getCkoOrders();

        assert.lengthOf(found, 1);
        assert.equal(found[0].orderNo, '00002');
    });

    it('without balances from Checkout.com, limits come from the order\'s captures and refunds', function() {
        var helper = helperWith({});
        var paid = order('00001', [instrument('pay_1', 'AUTH'), instrument('pay_1', 'CAPTURE', 20), instrument('pay_1', 'CREDIT', 5)]);

        helper.getPaymentBalances = function() { return null; };
        assert.equal(helper.getAvailableAmount(paid, 'pay_1', 'capture'), 2500);
        assert.equal(helper.getAvailableAmount(paid, 'pay_1', 'refund'), 1500);
        assert.equal(helper.getAvailableAmount(paid, 'pay_1', 'void'), 0);

        helper.getPaymentBalances = function() { return { available_to_capture: 4500, available_to_refund: 0, available_to_void: 4500 }; };
        assert.equal(helper.getAvailableAmount(paid, 'pay_1', 'capture'), 4500);
    });

    it('reads the balances with the service registry, for the payment id, encoded', function() {
        var calls = [];
        var helper = proxyquire(BM + '/scripts/helpers/CKOHelper', {
            'dw/order/OrderMgr': {},
            'dw/order/PaymentMgr': {},
            'dw/order/PaymentTransaction': {},
            'dw/web/Resource': { msg: function(key) { return key; } },
            'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; } },
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return null; } }; } },
            'dw/svc/LocalServiceRegistry': {
                createService: function(id, callbacks) {
                    var svc = { url: 'https://api.sandbox.checkout.com/payments', getURL: function() { return this.url; }, setURL: function(value) { this.url = value; }, setRequestMethod: function() {}, addHeader: function() {} };

                    return {
                        call: function() {
                            callbacks.createRequest(svc);
                            calls.push({ id: id, url: svc.url });

                            return { isOk: function() { return true; }, getObject: function() { return callbacks.parseResponse(svc, { text: '{"balances":{"available_to_capture":4500}}' }); } };
                        },
                    };
                },
            },
            '*/cartridge/config/ckoCurrencyConfig': ckoCurrencyConfig,
            '*/cartridge/config/constants': constants,
        });

        helper.getValue = function() { return 'sandbox'; };
        helper.getServiceEndpoint = function() { return null; };
        helper.getAccountKeys = function() { return { secretKey: 'sk_test' }; };
        helper.getCartridgeMeta = function() { return 'test'; };

        assert.deepEqual(helper.getPaymentBalances({ custom: {} }, 'pay_a/b'), { available_to_capture: 4500 });
        assert.deepEqual(calls, [{ id: 'cko.verify.charges.sandbox.service', url: 'https://api.sandbox.checkout.com/payments/pay_a%2Fb' }]);
    });

    it('encodes the payment id in the service URL', function() {
        var helper = helperWith({});
        var url = 'https://api.sandbox.checkout.com/payments/chargeId/captures';

        helper.getService = function() {
            return { getURL: function() { return url; }, setURL: function(value) { url = value; }, setRequestMethod: function() {}, call: function() { return { status: 'OK', object: {} }; } };
        };
        helper.getGatewayClient('cko.transaction.capture.sandbox.service', { chargeId: 'pay_a/b?x', amount: 1 });
        assert.equal(url, 'https://api.sandbox.checkout.com/payments/pay_a%2Fb%3Fx/captures');
    });
});

describe('BM console: the view-only list never offers capture, refund or void', function() {
    var fs = require('fs');
    var path = require('path');
    var root = path.join(__dirname, BM);

    /**
     * Run a module's ListTransactions and return what it rendered.
     * @param {string} controller The controller
     * @returns {Object} The template and its data
     */
    function renderList(controller) {
        var rendered = null;
        var log = { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {} }; } };

        proxyquire(BM + '/controllers/' + controller, {
            'dw/template/ISML': { renderTemplate: function(template, data) { rendered = { template: template, data: data }; } },
            'dw/web/CSRFProtection': {},
            'dw/system/Logger': log,
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return '2024'; } }; } },
            '*/cartridge/scripts/helpers/CKOHelper': {},
            '*/cartridge/config/constants': constants,
        }).ListTransactions();

        return rendered;
    }

    it('renders the list without actions from the view-only module, with them from the actions module', function() {
        assert.deepEqual(renderList('CKOTransactions'), { template: 'transactions/list', data: { startFilterYear: '2024', canAct: false } });
        assert.deepEqual(renderList('CKOTransactionActions'), { template: 'transactions/list', data: { startFilterYear: '2024', canAct: true } });
    });

    it('opens each module on its own list: only the actions module runs CKOTransactionActions', function() {
        var extensions = fs.readFileSync(path.join(root, 'bm_extensions.xml'), 'utf8');
        var menuAction = function(id) { return extensions.match(new RegExp('<menuaction id="' + id + '"[\\s\\S]*?</menuaction>'))[0]; };
        var viewOnly = menuAction('checkoutcom_transactions_manager_action');

        assert.match(viewOnly, /<exec pipeline="CKOTransactions" node="ListTransactions" \/>/);
        assert.notMatch(viewOnly, /CKOTransactionActions/);
        assert.match(menuAction('checkoutcom_transaction_actions'), /<exec pipeline="CKOTransactionActions" node="ListTransactions" \/>/);
    });

    it('leaves the action dialogs, CSRF token and Actions column out of the view-only page', function() {
        var list = fs.readFileSync(path.join(root, 'templates/default/transactions/list.isml'), 'utf8');
        var listJs = fs.readFileSync(path.join(root, 'static/default/js/core/list.js'), 'utf8').replace(/document\.addEventListener[\s\S]*$/, '');
        var columns = function(canAct) {
            // eslint-disable-next-line no-new-func
            return new Function('jQuery', listJs + ';return getTableColumns()')(function() { return { val: function() { return canAct; } }; })
                .map(function(column) { return column.field; });
        };

        assert.match(list, /<isif condition="\$\{pdict\.canAct\}">\s*<isinclude template="transactions\/modal">\s*<\/isif>/);
        assert.notInclude(columns('false'), 'actions');
        assert.include(columns('true'), 'actions');
    });
});
