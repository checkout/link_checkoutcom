'use strict';

var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');
var Site = require('dw/system/Site');

var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

var constants = require('*/cartridge/config/constants');

/**
 * Map of ISO country codes to phone dial codes for Tamara-supported markets.
 */
var COUNTRY_DIAL_CODES = {
    SA: '966',
    AE: '971',
};

/**
 * Tamara is only ever available for SAR/AED orders (SA/AE), so the order currency is a
 * reliable fallback when the billing address itself has no country code recorded.
 */
var CURRENCY_COUNTRY_FALLBACK = {
    SAR: 'SA',
    AED: 'AE',
};

/**
 * Utility functions for the Tamara payment method.
 */
var tamaraHelper = {
    /**
     * Handle the Tamara payment request.
     * @param {string} processorId The processor ID
     * @param {Object} order The order instance
     * @returns {Object} The request result with redirectUrl on success
     */
    handleRequest: function(processorId, order) {
        var gatewayResponse = null;
        var serviceId = 'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';

        var gatewayRequest = this.getTamaraRequest(order, processorId);

        // Log the payment request data
        ckoHelper.log(
            processorId + ' ' + ckoHelper._('cko.request.data', 'cko'),
            gatewayRequest
        );

        try {
            gatewayResponse = ckoHelper.gatewayClientRequest(serviceId, gatewayRequest);
        } catch (e) {
            Logger.error('Error while processing Tamara payment request for order: ' + order.orderNo + '. Error: ' + e.message);
            return { error: true };
        }

        return this.handleResponse(gatewayResponse, order.orderNo);
    },

    /**
     * Build the Tamara payment request payload.
     * @param {Object} order The order instance
     * @param {string} processorId The processor ID
     * @returns {Object} The payment request data
     */
    getTamaraRequest: function(order, processorId) {
        var paymentInstruments = order.getPaymentInstruments();
        var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1]
            .getPaymentTransaction().getAmount().getValue().toFixed(2);

        var orderCurrency = order.getCurrencyCode();
        var amount = ckoHelper.getFormattedPrice(paymentInstrumentAmount, orderCurrency);

        var billingAddress = order.getBillingAddress();
        var shippingAddress = order.getDefaultShipment().getShippingAddress();
        var processingChannelId = Site.getCurrent().getCustomPreferenceValue(constants.CKO_PROCESSING_CHANNEL_ID) || '';

        var billingCountry = (billingAddress.getCountryCode() && billingAddress.getCountryCode().value) || '';
        billingCountry = billingCountry.toUpperCase();
        if (!COUNTRY_DIAL_CODES[billingCountry]) {
            billingCountry = CURRENCY_COUNTRY_FALLBACK[orderCurrency] || billingCountry;
        }

        var shippingCountry = (shippingAddress.getCountryCode() && shippingAddress.getCountryCode().value) || '';
        shippingCountry = shippingCountry.toUpperCase();
        if (!COUNTRY_DIAL_CODES[shippingCountry]) {
            shippingCountry = CURRENCY_COUNTRY_FALLBACK[orderCurrency] || shippingCountry;
        }

        var customer = ckoHelper.getCustomer(order);
        if (billingAddress.getPhone()) {
            customer.phone = {
                country_code: COUNTRY_DIAL_CODES[billingCountry] || '',
                number: billingAddress.getPhone().replace(/^\+/, '').trim(),
            };
        }

        var items = [];
        var pliIterator = order.getProductLineItems().iterator();
        while (pliIterator.hasNext()) {
            var pli = pliIterator.next();
            var unitPrice = parseInt(
                ckoHelper.getFormattedPrice((pli.grossPrice.value / pli.quantityValue).toFixed(2), orderCurrency),
                10
            );

            items.push({
                type: 'physical',
                name: pli.getProductName(),
                quantity: pli.getQuantityValue(),
                unit_price: unitPrice,
                reference: pli.getProductID(),
            });
        }

        return {
            amount: amount,
            currency: orderCurrency,
            capture: true,
            reference: order.orderNo,
            source: {
                type: 'tamara',
                billing_address: {
                    address_line1: billingAddress.getAddress1() || '',
                    address_line2: billingAddress.getAddress2() || '',
                    city: billingAddress.getCity() || '',
                    zip: billingAddress.getPostalCode() || '',
                    country: billingCountry,
                },
            },
            customer: customer,
            shipping: {
                address: {
                    address_line1: shippingAddress.getAddress1() || '',
                    address_line2: shippingAddress.getAddress2() || '',
                    city: shippingAddress.getCity() || '',
                    zip: shippingAddress.getPostalCode() || '',
                    country: shippingCountry,
                },
            },
            items: items,
            processing_channel_id: processingChannelId,
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            metadata: ckoHelper.getMetadata({}, processorId),
        };
    },

    /**
     * Handle the Tamara payment response.
     * @param {Object} gatewayResponse The gateway response
     * @param {string} orderNumber The order number (for logging)
     * @returns {Object} The payment result
     */
    handleResponse: function(gatewayResponse, orderNumber) {
        var result = {
            error: true,
            redirectUrl: false,
        };

        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'id')) {
            result.transactionID = gatewayResponse.id;

            // Log the payment response data
            ckoHelper.log(
                'CHECKOUTCOM_TAMARA ' + ckoHelper._('cko.response.data', 'cko'),
                gatewayResponse
            );

            var hasRedirectLink = Object.prototype.hasOwnProperty.call(gatewayResponse, '_links')
                && Object.prototype.hasOwnProperty.call(gatewayResponse._links, 'redirect');

            if (hasRedirectLink) {
                result.error = false;
                result.redirectUrl = gatewayResponse._links.redirect.href;
            } else {
                result.errorMessage = 'No redirect URL in Tamara payment response. Payment ID: ' + gatewayResponse.id + ', Order: ' + orderNumber;
                Logger.error(result.errorMessage);
            }
        } else {
            Logger.error('Invalid or empty Tamara payment response for order: ' + orderNumber);
        }

        return result;
    },
};

module.exports = tamaraHelper;
