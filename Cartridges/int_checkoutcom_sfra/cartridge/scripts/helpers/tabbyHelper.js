'use strict';

/* API Includes */
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');
var Site = require('dw/system/Site');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

var TABBY_COUNTRY_DIAL_CODES = {
    AE: '+971', SA: '+966', KW: '+965', QA: '+974',
    BH: '+973', EG: '+20',  IQ: '+964', JO: '+962',
    LB: '+961', LY: '+218', MA: '+212', OM: '+968',
    SD: '+249', SY: '+963', TN: '+216', YE: '+967',
    DZ: '+213',
};

/**
 * Builds the Tabby Payment Context request payload.
 * @param {dw.order.Basket} basket The current basket
 * @returns {Object} The payment context request data
 */
function buildContextRequest(basket) {
    var shipment = basket.getDefaultShipment();
    var shippingAddress = shipment ? shipment.getShippingAddress() : null;
    var billingAddress = basket.getBillingAddress();
    var addressCountry = shippingAddress ? shippingAddress.getCountryCode().getValue().toUpperCase() : '';
    var localeCountry = ckoHelper.getLanguage().split('-')[1] || '';
    var countryCode = addressCountry || localeCountry;

    var amount = parseInt(ckoHelper.getFormattedPrice(
        basket.getTotalGrossPrice().getValue(),
        basket.getCurrencyCode()
    ), 10);

    var customer = {
        email: basket.getCustomerEmail() || '',
        name: shippingAddress
            ? (shippingAddress.getFirstName() + ' ' + shippingAddress.getLastName()).trim()
            : '',
    };

    var phoneNumber = (shippingAddress && shippingAddress.getPhone())
        || (billingAddress && billingAddress.getPhone())
        || '';

    if (phoneNumber) {
        customer.phone = {
            country_code: TABBY_COUNTRY_DIAL_CODES[countryCode] || null,
            number: phoneNumber,
        };
    }

    return {
        source: { type: 'tabby' },
        amount: amount,
        currency: basket.getCurrencyCode(),
        customer: customer,
        processing: {
            locale: ckoHelper.getLanguage(),
        },
        processing_channel_id: Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId'),
        success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
        failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
    };
}

/**
 * Builds the items array from the order's product line items.
 * @param {dw.order.Order} order The order instance
 * @returns {Array} The items array
 */
function buildItems(order) {
    var items = [];
    var productLineItems = order.getProductLineItems();
    var currencyCode = order.getCurrencyCode();

    for (var i = 0; i < productLineItems.length; i++) {
        var pli = productLineItems[i];
        var quantity = pli.getQuantityValue();
        var totalPrice = pli.getAdjustedPrice().getValue();
        var unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;

        items.push({
            name: pli.getProductName(),
            quantity: quantity,
            unit_price: parseInt(ckoHelper.getFormattedPrice(unitPrice, currencyCode), 10),
            reference: pli.getProductID(),
            type: 'physical',
        });
    }

    return items;
}

/**
 * Builds the shipping object from the order's default shipment.
 * @param {dw.order.Order} order The order instance
 * @returns {Object} The shipping object
 */
function buildShipping(order) {
    var shipment = order.getDefaultShipment();
    var shippingAddress = shipment ? shipment.getShippingAddress() : null;
    var shippingAmount = shipment ? shipment.getAdjustedShippingTotalPrice().getValue() : 0;
    var currencyCode = order.getCurrencyCode();

    var shipping = {
        amount: parseInt(ckoHelper.getFormattedPrice(shippingAmount, currencyCode), 10),
    };

    if (shippingAddress) {
        shipping.address = {
            address_line1: shippingAddress.getAddress1() || '',
            city: shippingAddress.getCity() || '',
            zip: shippingAddress.getPostalCode() || '',
            country: shippingAddress.getCountryCode().getValue().toUpperCase() || '',
        };
        var stateCode = shippingAddress.getStateCode();
        if (stateCode && stateCode !== 'undefined' && stateCode !== 'null') {
            shipping.address.state = stateCode;
        }
    }

    return shipping;
}

/**
 * Builds the Tabby payment request payload using the stored payment context.
 * @param {dw.order.Order} order The order instance
 * @param {string} processorId The processor ID
 * @param {string} paymentContextId The payment_context_id from the Payment Context API
 * @param {string} paymentType The payment_type from the Payment Context API
 * @returns {Object} The payment request data
 */
function buildPaymentRequest(order, processorId, paymentContextId, paymentType) {
    var enableCapture = Site.getCurrent().getCustomPreferenceValue(constants.CKO_TABBY_ENABLE_CAPTURE);

    return {
        payment_context_id: paymentContextId,
        payment_type: paymentType,
        processing_channel_id: Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId'),
        capture: enableCapture,
        reference: order.orderNo,
        metadata: ckoHelper.getMetadata({}, processorId),
        items: buildItems(order),
        shipping: buildShipping(order),
    };
}

/**
 * Handles the Tabby payment API response.
 * @param {Object} gatewayResponse The raw gateway response
 * @param {string} orderNumber The order number for logging
 * @returns {Object} The result with redirectUrl on success
 */
function handleResponse(gatewayResponse, orderNumber) {
    var result = { error: true, redirectUrl: false };

    if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'id')) {
        result.transactionID = gatewayResponse.id;

        ckoHelper.log('CHECKOUTCOM_TABBY ' + ckoHelper._('cko.response.data', 'cko'), gatewayResponse);

        var hasRedirectLink = Object.prototype.hasOwnProperty.call(gatewayResponse, '_links')
            && Object.prototype.hasOwnProperty.call(gatewayResponse._links, 'redirect');

        if (hasRedirectLink) {
            result.error = false;
            result.redirectUrl = gatewayResponse._links.redirect.href;
        } else {
            result.errorMessage = 'No redirect URL in Tabby payment response for order: ' + orderNumber;
            Logger.error(result.errorMessage);
        }
    } else {
        Logger.error('Invalid or empty Tabby payment response for order: ' + orderNumber);
    }

    return result;
}

/**
 * Main entry point called by the CHECKOUTCOM_TABBY processor.
 * @param {string} processorId The processor ID
 * @param {dw.order.Order} order The order instance
 * @param {string} paymentContextId The stored payment_context_id
 * @param {string} paymentType The stored payment_type
 * @returns {Object} The result with redirectUrl on success
 */
function handleRequest(processorId, order, paymentContextId, paymentType) {
    var serviceId = 'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';
    var gatewayRequest = buildPaymentRequest(order, processorId, paymentContextId, paymentType);

    ckoHelper.log(processorId + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

    var gatewayResponse;
    try {
        gatewayResponse = ckoHelper.gatewayClientRequest(serviceId, gatewayRequest);
    } catch (e) {
        Logger.error('Error while processing Tabby payment for order: ' + order.orderNo + '. Error: ' + e.message);
        return { error: true };
    }

    return handleResponse(gatewayResponse, order.orderNo);
}

module.exports = {
    buildContextRequest: buildContextRequest,
    handleRequest: handleRequest,
};
