'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = require('../../Cartridges/int_checkoutcom_sfra/cartridge/config/constants');

describe('tamaraHelper', function () {
    var ckoHelperStub;
    var URLUtilsStub;
    var SiteStub;
    var LoggerErrorSpy;
    var tamaraHelper;

    /**
     * Builds a fake dw.order.Order instance exposing only the members
     * getTamaraRequest/handleRequest actually touch.
     * @param {Object} opts overrides for the fake order
     * @returns {Object} fake order
     */
    function createFakeOrder(opts) {
        opts = opts || {};

        var paymentInstrument = {
            getPaymentTransaction: function () {
                return {
                    getAmount: function () {
                        return { getValue: function () { return opts.amount !== undefined ? opts.amount : 100; } };
                    },
                };
            },
        };

        var billingAddress = {
            getCountryCode: function () {
                return Object.prototype.hasOwnProperty.call(opts, 'billingCountryCode')
                    ? opts.billingCountryCode
                    : { value: 'SA' };
            },
            getPhone: function () {
                return Object.prototype.hasOwnProperty.call(opts, 'phone') ? opts.phone : '+966501234567';
            },
            getAddress1: function () { return 'Billing Address 1'; },
            getAddress2: function () { return 'Billing Address 2'; },
            getCity: function () { return 'Riyadh'; },
            getPostalCode: function () { return '12345'; },
        };

        var shippingAddress = {
            getCountryCode: function () {
                return Object.prototype.hasOwnProperty.call(opts, 'shippingCountryCode')
                    ? opts.shippingCountryCode
                    : { value: 'SA' };
            },
            getAddress1: function () { return 'Shipping Address 1'; },
            getAddress2: function () { return 'Shipping Address 2'; },
            getCity: function () { return 'Riyadh'; },
            getPostalCode: function () { return '54321'; },
        };

        var pliList = opts.productLineItems || [
            {
                grossPrice: { value: 200 },
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
            getPaymentInstruments: function () { return [paymentInstrument]; },
            getCurrencyCode: function () { return opts.currency || 'SAR'; },
            getBillingAddress: function () { return billingAddress; },
            getDefaultShipment: function () {
                return { getShippingAddress: function () { return shippingAddress; } };
            },
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
            getFormattedPrice: sinon.stub().callsFake(function (price) { return String(price); }),
            getCustomer: sinon.stub().returns({}),
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
                return { getCustomPreferenceValue: sinon.stub().returns('channel123') };
            },
        };

        LoggerErrorSpy = sinon.stub();

        tamaraHelper = proxyquire('../../Cartridges/int_checkoutcom_sfra/cartridge/scripts/helpers/tamaraHelper', {
            'dw/web/URLUtils': URLUtilsStub,
            'dw/system/Logger': { getLogger: function () { return { error: LoggerErrorSpy }; } },
            'dw/system/Site': SiteStub,
            '*/cartridge/scripts/helpers/ckoHelper': ckoHelperStub,
            '*/cartridge/config/constants': constants,
        });
    });

    describe('getTamaraRequest', function () {
        it('builds a request payload with the correct top-level fields', function () {
            var order = createFakeOrder({ orderNo: 'ORDER-001', currency: 'SAR', amount: 100 });
            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.equal(request.amount, '100.00');
            assert.equal(request.currency, 'SAR');
            assert.isTrue(request.capture);
            assert.equal(request.reference, 'ORDER-001');
            assert.equal(request.source.type, 'tamara');
            assert.equal(request.processing_channel_id, 'channel123');
            assert.equal(request.success_url, 'https://example.com/CKOMain-HandleReturn');
            assert.equal(request.failure_url, 'https://example.com/CKOMain-HandleFail');
            assert.equal(request.metadata.payment_processor, 'CHECKOUTCOM_TAMARA');
        });

        it('builds one item per product line item using rounded unit price', function () {
            var order = createFakeOrder({
                productLineItems: [{
                    grossPrice: { value: 200 },
                    quantityValue: 2,
                    getProductName: function () { return 'Test Product'; },
                    getQuantityValue: function () { return 2; },
                    getProductID: function () { return 'PROD-1'; },
                }],
            });

            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.lengthOf(request.items, 1);
            assert.deepEqual(request.items[0], {
                type: 'physical',
                name: 'Test Product',
                quantity: 2,
                unit_price: 100,
                reference: 'PROD-1',
            });
        });

        it('uses the billing/shipping country code when it is a supported Tamara market', function () {
            var order = createFakeOrder({
                currency: 'SAR',
                billingCountryCode: { value: 'AE' },
                shippingCountryCode: { value: 'AE' },
            });

            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.equal(request.source.billing_address.country, 'AE');
            assert.equal(request.shipping.address.country, 'AE');
        });

        it('falls back to the currency-derived country when the address country is unsupported', function () {
            var order = createFakeOrder({
                currency: 'SAR',
                billingCountryCode: { value: 'XX' },
                shippingCountryCode: null,
            });

            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.equal(request.source.billing_address.country, 'SA');
            assert.equal(request.shipping.address.country, 'SA');
        });

        it('falls back to AE for AED orders with an unsupported address country', function () {
            var order = createFakeOrder({
                currency: 'AED',
                billingCountryCode: { value: 'XX' },
                shippingCountryCode: { value: 'XX' },
            });

            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.equal(request.source.billing_address.country, 'AE');
            assert.equal(request.shipping.address.country, 'AE');
        });

        it('attaches a normalized phone number when the billing address has one', function () {
            var order = createFakeOrder({ currency: 'SAR', phone: '+966501234567' });

            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.deepEqual(request.customer.phone, { country_code: '966', number: '966501234567' });
        });

        it('does not attach a phone object when the billing address has none', function () {
            var order = createFakeOrder({ currency: 'SAR', phone: '' });

            var request = tamaraHelper.getTamaraRequest(order, 'CHECKOUTCOM_TAMARA');

            assert.isUndefined(request.customer.phone);
        });
    });

    describe('handleResponse', function () {
        it('returns the redirect URL and transaction ID for a valid response', function () {
            var result = tamaraHelper.handleResponse({
                id: 'pay_123',
                _links: { redirect: { href: 'https://pay.tamara.co/redirect' } },
            }, 'ORDER-001');

            assert.isFalse(result.error);
            assert.equal(result.redirectUrl, 'https://pay.tamara.co/redirect');
            assert.equal(result.transactionID, 'pay_123');
        });

        it('flags an error when the response has no redirect link', function () {
            var result = tamaraHelper.handleResponse({ id: 'pay_123' }, 'ORDER-001');

            assert.isTrue(result.error);
            assert.isFalse(result.redirectUrl);
            assert.match(result.errorMessage, /pay_123/);
            assert.isTrue(LoggerErrorSpy.called);
        });

        it('flags an error for an empty/invalid response', function () {
            var result = tamaraHelper.handleResponse(null, 'ORDER-001');

            assert.isTrue(result.error);
            assert.isFalse(result.redirectUrl);
            assert.isTrue(LoggerErrorSpy.called);
        });
    });

    describe('handleRequest', function () {
        it('calls the gateway and returns a redirect URL on success', function () {
            ckoHelperStub.gatewayClientRequest.returns({
                id: 'pay_123',
                _links: { redirect: { href: 'https://pay.tamara.co/redirect' } },
            });

            var order = createFakeOrder({ orderNo: 'ORDER-001' });
            var result = tamaraHelper.handleRequest('CHECKOUTCOM_TAMARA', order);

            assert.isFalse(result.error);
            assert.equal(result.redirectUrl, 'https://pay.tamara.co/redirect');
            assert.isTrue(ckoHelperStub.gatewayClientRequest.calledOnce);
        });

        it('returns an error result when the gateway call throws', function () {
            ckoHelperStub.gatewayClientRequest.throws(new Error('service unavailable'));

            var order = createFakeOrder({ orderNo: 'ORDER-001' });
            var result = tamaraHelper.handleRequest('CHECKOUTCOM_TAMARA', order);

            assert.deepEqual(result, { error: true });
            assert.isTrue(LoggerErrorSpy.called);
        });
    });
});
