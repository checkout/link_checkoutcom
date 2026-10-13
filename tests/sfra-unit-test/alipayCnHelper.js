'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = require('../../Cartridges/int_checkoutcom_sfra/cartridge/config/constants');

describe('alipayCnHelper', function () {
    var ckoHelperStub;
    var URLUtilsStub;
    var SiteStub;
    var LoggerErrorSpy;
    var alipayCnHelper;

    /**
     * Builds a fake dw.order.Order instance exposing only the members
     * getAlipayCnRequest/handleRequest actually touch.
     * @param {Object} opts overrides for the fake order
     * @returns {Object} fake order
     */
    function createFakeOrder(opts) {
        opts = opts || {};

        var billingAddress = opts.billingAddress || { fake: 'billingAddress' };

        var pliList = opts.productLineItems || [
            {
                adjustedGrossPrice: { value: 200 },
                quantityValue: 2,
                getProductName: function () { return 'Test Product'; },
                getQuantityValue: function () { return 2; },
                getProductID: function () { return 'PROD-1'; },
            },
        ];

        var pliIndex = 0;
        var pliIterator = {
            hasNext: function () { return pliIndex < pliList.length; },
            next: function () { return pliList[pliIndex++]; },
        };

        return {
            orderNo: opts.orderNo || 'ORDER-001',
            getCurrencyCode: function () { return opts.currency || 'CNY'; },
            getBillingAddress: function () { return billingAddress; },
            getProductLineItems: function () {
                return { iterator: function () { return pliIterator; } };
            },
        };
    }

    beforeEach(function () {
        ckoHelperStub = {
            getValue: sinon.stub().returns('test'),
            log: sinon.stub(),
            _: sinon.stub().returns('translated'),
            gatewayClientRequest: sinon.stub(),
            getAmount: sinon.stub().returns('225.98'),
            getFormattedPrice: sinon.stub().callsFake(function (price) { return String(price); }),
            getFormattedBillingAddress: sinon.stub().returns({ address_line1: 'formatted billing address' }),
            getCustomer: sinon.stub().returns({ email: 'shopper@example.com' }),
            getShipping: sinon.stub().returns({ address: { address_line1: 'formatted shipping address' } }),
            getMetadata: sinon.stub().callsFake(function (data, processorId) {
                return { integration_data: 'x', platform_data: 'y', payment_processor: processorId };
            }),
        };

        URLUtilsStub = {
            https: sinon.stub().callsFake(function (action) {
                return { toString: function () { return 'https://example.com/' + action; } };
            }),
        };

        SiteStub = {
            getCurrent: function () {
                return { getCustomPreferenceValue: sinon.stub().returns('channel456') };
            },
        };

        LoggerErrorSpy = sinon.stub();

        alipayCnHelper = proxyquire('../../Cartridges/int_checkoutcom_sfra/cartridge/scripts/helpers/alipayCnHelper', {
            'dw/web/URLUtils': URLUtilsStub,
            'dw/system/Logger': { getLogger: function () { return { error: LoggerErrorSpy }; } },
            'dw/system/Site': SiteStub,
            '*/cartridge/scripts/helpers/ckoHelper': ckoHelperStub,
            '*/cartridge/config/constants': constants,
        });
    });

    describe('getAlipayCnRequest', function () {
        it('builds a request payload with the correct top-level fields', function () {
            var order = createFakeOrder({ orderNo: 'ORDER-001', currency: 'CNY' });
            var request = alipayCnHelper.getAlipayCnRequest(order, 'CHECKOUTCOM_ALIPAYCN');

            assert.equal(request.amount, '225.98');
            assert.equal(request.currency, 'CNY');
            assert.isTrue(request.capture);
            assert.equal(request.payment_type, 'Regular');
            assert.equal(request.reference, 'ORDER-001');
            assert.equal(request.source.type, 'alipay_cn');
            assert.equal(request.processing.terminal_type, 'WEB');
            assert.equal(request.processing_channel_id, 'channel456');
            assert.equal(request.success_url, 'https://example.com/CKOMain-HandleReturn');
            assert.equal(request.failure_url, 'https://example.com/CKOMain-HandleFail');
            assert.equal(request.metadata.payment_processor, 'CHECKOUTCOM_ALIPAYCN');
        });

        it('delegates billing address, customer, and shipping to ckoHelper', function () {
            var billingAddress = { fake: 'billingAddress' };
            var order = createFakeOrder({ billingAddress: billingAddress });

            var request = alipayCnHelper.getAlipayCnRequest(order, 'CHECKOUTCOM_ALIPAYCN');

            assert.isTrue(ckoHelperStub.getFormattedBillingAddress.calledWith(billingAddress));
            assert.isTrue(ckoHelperStub.getCustomer.calledWith(order));
            assert.isTrue(ckoHelperStub.getShipping.calledWith(order));
            assert.deepEqual(request.source.billing_address, { address_line1: 'formatted billing address' });
            assert.deepEqual(request.customer, { email: 'shopper@example.com' });
            assert.deepEqual(request.shipping, { address: { address_line1: 'formatted shipping address' } });
        });

        it('builds one item per product line item using rounded unit price', function () {
            var order = createFakeOrder({
                productLineItems: [{
                    adjustedGrossPrice: { value: 200 },
                    quantityValue: 2,
                    getProductName: function () { return 'Test Product'; },
                    getQuantityValue: function () { return 2; },
                    getProductID: function () { return 'PROD-1'; },
                }],
            });

            var request = alipayCnHelper.getAlipayCnRequest(order, 'CHECKOUTCOM_ALIPAYCN');

            assert.lengthOf(request.items, 1);
            assert.deepEqual(request.items[0], {
                reference: 'PROD-1',
                name: 'Test Product',
                quantity: 2,
                unit_price: 100,
            });
        });
    });

    describe('handleResponse', function () {
        it('returns the redirect URL and transaction ID for a valid response', function () {
            var result = alipayCnHelper.handleResponse({
                id: 'pay_123',
                _links: { redirect: { href: 'https://open-sea-global.alipayplus.com/redirect' } },
            }, 'ORDER-001');

            assert.isFalse(result.error);
            assert.equal(result.redirectUrl, 'https://open-sea-global.alipayplus.com/redirect');
            assert.equal(result.transactionID, 'pay_123');
        });

        it('flags an error when the response has no redirect link', function () {
            var result = alipayCnHelper.handleResponse({ id: 'pay_123' }, 'ORDER-001');

            assert.isTrue(result.error);
            assert.isFalse(result.redirectUrl);
            assert.match(result.errorMessage, /pay_123/);
            assert.isTrue(LoggerErrorSpy.called);
        });

        it('flags an error for an empty/invalid response', function () {
            var result = alipayCnHelper.handleResponse(null, 'ORDER-001');

            assert.isTrue(result.error);
            assert.isFalse(result.redirectUrl);
            assert.isTrue(LoggerErrorSpy.called);
        });
    });

    describe('handleRequest', function () {
        it('calls the gateway and returns a redirect URL on success', function () {
            ckoHelperStub.gatewayClientRequest.returns({
                id: 'pay_123',
                _links: { redirect: { href: 'https://open-sea-global.alipayplus.com/redirect' } },
            });

            var order = createFakeOrder({ orderNo: 'ORDER-001' });
            var result = alipayCnHelper.handleRequest('CHECKOUTCOM_ALIPAYCN', order);

            assert.isFalse(result.error);
            assert.equal(result.redirectUrl, 'https://open-sea-global.alipayplus.com/redirect');
            assert.isTrue(ckoHelperStub.gatewayClientRequest.calledOnce);
        });

        it('returns an error result when the gateway call throws', function () {
            ckoHelperStub.gatewayClientRequest.throws(new Error('service unavailable'));

            var order = createFakeOrder({ orderNo: 'ORDER-001' });
            var result = alipayCnHelper.handleRequest('CHECKOUTCOM_ALIPAYCN', order);

            assert.deepEqual(result, { error: true });
            assert.isTrue(LoggerErrorSpy.called);
        });
    });
});
