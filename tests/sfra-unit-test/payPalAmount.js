'use strict';

/**
 * PayPal: the payment data comes from the browser, so its processing channel is
 * never used and the payment must be for the order's amount and currency.
 */

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var constants = require(CARTRIDGE + '/config/constants');

describe('payPalHelper', function() {
    var requests;
    var readBack;
    var orderGuard;
    var helper;
    var order = {
        orderNo: 'ORDER-1',
        getCurrencyCode: function() { return 'EUR'; },
    };

    beforeEach(function() {
        requests = [];
        readBack = { id: 'pay_1', amount: 4500, currency: 'EUR', status: 'Captured' };
        orderGuard = { reversePayment: sinon.spy(), reverseStrayPayments: sinon.spy() };
        helper = proxyquire(CARTRIDGE + '/scripts/helpers/payPalHelper', {
            'dw/system/Transaction': {},
            'dw/order/BasketMgr': {},
            'dw/system/HookMgr': {},
            'dw/order/PaymentMgr': {},
            'dw/web/Resource': {},
            'dw/order/OrderMgr': { getOrder: function() { return order; } },
            'dw/system/Logger': { getLogger: function() { return { error: function() {} }; } },
            'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function() { return 'pc_site'; } }; } },
            '*/cartridge/scripts/helpers/basketCalculationHelpers': {},
            '*/cartridge/scripts/checkout/checkoutHelpers': {},
            '*/cartridge/scripts/helpers/ckoHelper': {
                getHost: function() { return ''; },
                formatCustomerIP: function() { return ''; },
                getCustomer: function() { return {}; },
                getValue: function() { return 'sandbox'; },
                getMetadata: function() { return {}; },
                log: function() {},
                _: function(key) { return key; },
                getAmount: function() { return '4500'; },
                paymentResponseValidation: function(response) { return !!response && !!response.reference; },
                gatewayClientRequest: function(service, request) {
                    requests.push({ service: service, request: request });

                    return service.indexOf('verify') !== -1 ? readBack : { id: 'pay_1', reference: 'ORDER-1' };
                },
            },
            '*/cartridge/scripts/helpers/orderGuard': orderGuard,
            '*/cartridge/config/constants': constants,
        });
    });

    /**
     * @returns {Object} The payment result for a browser-sent payment context
     */
    function pay() {
        return helper.handleRequest(JSON.stringify({
            paymentContext_id: 'pct_1',
            payment_request: { processing_channel_id: 'pc_attacker' },
        }), 'CHECKOUTCOM_PAYPAL', 'ORDER-1');
    }

    it('uses the site\'s processing channel, not the browser\'s', function() {
        pay();

        assert.equal(requests[0].request.processing_channel_id, 'pc_site');
        assert.equal(requests[0].request.payment_context_id, 'pct_1');
    });

    it('accepts a payment for the order total', function() {
        var result = pay();

        assert.isFalse(result.error);
        assert.equal(result.transactionID, 'pay_1');
        assert.isFalse(orderGuard.reversePayment.called);
    });

    it('releases a payment for another amount or currency, and fails it', function() {
        readBack.amount = 100;
        assert.isTrue(pay().error);
        assert.isTrue(orderGuard.reversePayment.calledOnce);

        readBack.amount = 4500;
        readBack.currency = 'GBP';
        assert.isTrue(pay().error);
        assert.isTrue(orderGuard.reversePayment.calledTwice);
    });

    it('releases whatever was taken when the payment cannot be read back', function() {
        readBack = null;

        assert.isTrue(pay().error);
        assert.isTrue(orderGuard.reverseStrayPayments.calledWith('ORDER-1'));
    });
});
