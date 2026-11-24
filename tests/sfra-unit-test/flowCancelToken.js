'use strict';

/**
 * The Flow cancel link token (CKOFlow-HandleFail): one per order, so a cancel
 * link already on screen keeps working after a refresh, a second tab or the
 * inline mount, and never cancels another order.
 */

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';

describe('Flow cancel token (flowPaymentHelper)', function() {
    var helper;
    var counter;

    beforeEach(function() {
        counter = 0;
        global.session = { privacy: {} };
        helper = proxyquire(CARTRIDGE + '/scripts/helpers/flowPaymentHelper', {
            'dw/order/BasketMgr': {},
            'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {} }; } },
            'dw/order/Order': {},
            'dw/order/OrderMgr': {},
            'dw/order/PaymentMgr': {},
            'dw/order/PaymentTransaction': {},
            'dw/system/Transaction': { wrap: function(fn) { return fn(); } },
            'dw/crypto/Encoding': { toHex: function(bytes) { return bytes; } },
            'dw/crypto/SecureRandom': function() {
                this.nextBytes = function() {
                    counter += 1;

                    return 'token' + counter;
                };
            },
            '*/cartridge/scripts/checkout/checkoutHelpers': {},
            '*/cartridge/scripts/helpers/ckoHelper': { safeEquals: function(a, b) { return a === b; } },
            '*/cartridge/scripts/helpers/flowHelper': {},
            '*/cartridge/scripts/helpers/orderGuard': {},
            '*/cartridge/config/ckoFlowConfig': {},
        });
    });

    afterEach(function() {
        delete global.session;
    });

    it('keeps the same token for the same order (refresh, second tab, inline mount after Show)', function() {
        var first = helper.issueCancelToken('00001');
        var second = helper.issueCancelToken('00001');

        assert.equal(first, second);
        assert.isTrue(helper.isCancelToken(first, '00001'));
    });

    it('issues a new token for another order, and the old one stops working', function() {
        var first = helper.issueCancelToken('00001');
        var second = helper.issueCancelToken('00002');

        assert.notEqual(first, second);
        assert.isFalse(helper.isCancelToken(first, '00002'));
        assert.isTrue(helper.isCancelToken(second, '00002'));
    });

    it('never accepts a token for an order it was not issued for, a missing token, or one cleared with the session', function() {
        var token = helper.issueCancelToken('00001');

        assert.isFalse(helper.isCancelToken(token, '00002'));
        assert.isFalse(helper.isCancelToken(null, '00001'));
        assert.isFalse(helper.isCancelToken('other', '00001'));

        helper.clearSession();

        assert.isFalse(helper.isCancelToken(token, '00001'));
    });
});
