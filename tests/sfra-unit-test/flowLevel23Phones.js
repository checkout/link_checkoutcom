'use strict';

/**
 * Flow payment session (SFRA): phones as { country_code, number } and Visa /
 * Mastercard Level 2 / Level 3 data, sent only when the order has the value.
 */

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var SFRA = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var phoneHelper = require(SFRA + '/scripts/helpers/phoneHelper');

/**
 * @param {number} value An amount
 * @returns {Object} A dw.value.Money fake
 */
function money(value) {
    return { available: true, getValue: function() { return value; }, isAvailable: function() { return true; } };
}

/**
 * @param {Object} values phone, country
 * @returns {Object} A dw.order.OrderAddress fake
 */
function address(values) {
    return {
        getPhone: function() { return values.phone || null; },
        getCountryCode: function() { return values.country ? { getValue: function() { return values.country; } } : null; },
    };
}

/**
 * @param {Object} options taxPolicy (1 net, 0 gross)
 * @returns {Object} flowHelper with dw fakes
 */
function loadFlowHelper(options) {
    return proxyquire(SFRA + '/scripts/helpers/flowHelper', {
        'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {} }; } },
        'dw/web/Resource': { msg: function(key) { return key; } },
        'dw/system/Site': { getCurrent: function() { return { getDefaultLocale: function() { return 'en_US'; } }; } },
        'dw/order/TaxMgr': { TAX_POLICY_NET: 1, TAX_POLICY_GROSS: 0, getTaxationPolicy: function() { return options.taxPolicy; } },
        'dw/web/URLUtils': { https: function(route) { return { toString: function() { return 'https://shop.example/' + route; } }; } },
        '*/cartridge/scripts/helpers/ckoHelper': {
            getFormattedPrice: function(value) { return String(Math.round(Number(value) * 100)); },
            getCustomer: function() { return { email: 'jordan@example.com', name: 'Jordan Smith' }; },
            getAmount: function() { return 5300; },
            getValue: function() { return null; },
            getSiteName: function() { return 'Shop'; },
            getLanguage: function() { return 'en-US'; },
            getBillingDescriptor: function() { return null; },
            getFormattedBillingAddress: function() { return { address_line1: '1 Main St', country: 'GB' }; },
            getMetadata: function() { return {}; },
            get3Ds: function() { return { enabled: true }; },
            getShipping: function() { return { address: { address_line1: 'Unter den Linden 1', country: 'DE' } }; },
        },
        '*/cartridge/config/constants': {},
        '*/cartridge/config/ckoFlowConfig': { PAYMENT_PROCESSOR_ID: 'CHECKOUTCOM_FLOW' },
        '*/cartridge/scripts/services/flowSessions': {},
        '*/cartridge/scripts/helpers/phoneHelper': phoneHelper,
    });
}

/**
 * @param {Object} options orderNo, tax (line tax under net), unit, billingPhone, shippingPhone
 * @returns {Object} A dw.order.Order fake: one line of 40.00, shipping 5.00, tax 8.00
 */
function makeOrder(options) {
    var line = {
        getQuantityValue: function() { return 2; },
        getAdjustedPrice: function() { return money(40); },
        getProductName: function() { return 'Shirt'; },
        getProductID: function() { return 'P1'; },
        getTax: function() { return money(8); },
        getProduct: function() { return options.unit === undefined ? null : { getUnit: function() { return options.unit; } }; },
    };

    return {
        getOrderNo: function() { return options.orderNo || '00001'; },
        getCurrencyCode: function() { return 'EUR'; },
        getProductLineItems: function() {
            var items = [line];
            var index = 0;

            return { iterator: function() { return { hasNext: function() { return index < items.length; }, next: function() { return items[index++]; } }; } };
        },
        getAdjustedShippingTotalPrice: function() { return money(5); },
        getTotalTax: function() { return money(8); },
        getBillingAddress: function() { return address({ phone: options.billingPhone, country: 'GB' }); },
        getDefaultShipment: function() {
            return { getShippingAddress: function() { return address({ phone: options.shippingPhone, country: 'DE' }); } };
        },
    };
}

describe('Flow session (SFRA): phones', function() {
    it('splits the calling code from the number when it can be told', function() {
        assert.deepEqual(phoneHelper.toPhone('+49 30123456'), { country_code: '+49', number: '30123456' });
        assert.deepEqual(phoneHelper.toPhone('+4930123456'), { country_code: '+49', number: '30123456' });
        assert.deepEqual(phoneHelper.toPhone('030 123456', 'DE'), { country_code: '+49', number: '30123456' });
        assert.deepEqual(phoneHelper.toPhone('06 1 234 5678', 'HU'), { country_code: '+36', number: '12345678' });
        assert.deepEqual(phoneHelper.toPhone('06 1234 5678', 'IT'), { country_code: '+39', number: '0612345678' });
    });

    it('keeps the number as it is when the prefix rule is not known, never sending a null country code', function() {
        assert.deepEqual(phoneHelper.toPhone('0712345678', 'CI'), { number: '0712345678' });
        assert.deepEqual(phoneHelper.toPhone('030123456'), { number: '030123456' });
        assert.isNull(phoneHelper.toPhone(''));
    });

    it('sends the billing phone for billing and the customer, the shipping address\'s own for shipping', function() {
        var request = loadFlowHelper({ taxPolicy: 0 }).getSessionRequest(makeOrder({ billingPhone: '+44 7700900123', shippingPhone: '030 123456' }));

        assert.deepEqual(request.billing.phone, { country_code: '+44', number: '7700900123' });
        assert.deepEqual(request.customer.phone, { country_code: '+44', number: '7700900123' });
        assert.deepEqual(request.shipping.phone, { country_code: '+49', number: '30123456' });
    });

    it('falls back to the billing phone when the shipping address has none', function() {
        var request = loadFlowHelper({ taxPolicy: 0 }).getSessionRequest(makeOrder({ billingPhone: '+44 7700900123' }));

        assert.deepEqual(request.shipping.phone, { country_code: '+44', number: '7700900123' });
    });
});

describe('Flow session (SFRA): Level 2 / Level 3 data', function() {
    it('sends order_id, tax_amount and shipping_amount on the session, so auto-captured payments carry them', function() {
        var request = loadFlowHelper({ taxPolicy: 1 }).getSessionRequest(makeOrder({ orderNo: '00000123' }));

        assert.deepEqual(request.processing, { order_id: '00000123', tax_amount: 800, shipping_amount: 500 });
    });

    it('leaves out an order number longer than 15 characters', function() {
        var processing = loadFlowHelper({ taxPolicy: 1 }).getLevelTwoProcessing(makeOrder({ orderNo: 'ORDER-0000000000001' }));

        assert.notProperty(processing, 'order_id');
        assert.equal(processing.tax_amount, 800);
    });

    it('net taxation: product lines carry their tax and unit of measure; the items still add up', function() {
        var items = loadFlowHelper({ taxPolicy: 1 }).getItems(makeOrder({ unit: 'each' }));

        assert.equal(items[0].tax_amount, 800);
        assert.equal(items[0].unit_of_measure, 'EACH');
        assert.equal(items.reduce(function(sum, item) { return sum + item.total_amount; }, 0), 4000 + 500 + 800);
    });

    it('gross taxation: no item tax (it is inside the price); a unit that is not a measure code is left out', function() {
        var item = loadFlowHelper({ taxPolicy: 0 }).getItems(makeOrder({ unit: 'Stück 2' }))[0];

        assert.notProperty(item, 'tax_amount');
        assert.notProperty(item, 'unit_of_measure');
    });
});
