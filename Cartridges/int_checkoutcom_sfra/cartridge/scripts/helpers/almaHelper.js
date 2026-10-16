'use strict';

/* API Includes */
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Map of ISO country codes to phone dial codes for Alma-supported markets.
 */
var COUNTRY_DIAL_CODES = {
    AT: '+43',
    BE: '+32',
    DE: '+49',
    ES: '+34',
    FR: '+33',
    GB: '+44',
    IT: '+39',
    NL: '+31',
    PT: '+351',
};

/**
 * Utility functions for the Alma payment method.
 */
var almaHelper = {
    /**
     * Handle the Alma payment request.
     * @param {string} processorId The processor ID
     * @param {Object} order The order instance
     * @returns {Object} The request result with redirectUrl on success
     */
    handleRequest: function(processorId, order) {
        var gatewayResponse = null;
        var serviceId = 'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';

        var gatewayRequest = this.getAlmaRequest(order, processorId);

        // Log the payment request data
        ckoHelper.log(
            processorId + ' ' + ckoHelper._('cko.request.data', 'cko'),
            gatewayRequest
        );

        try {
            gatewayResponse = ckoHelper.gatewayClientRequest(serviceId, gatewayRequest);
        } catch (e) {
            Logger.error('Error while processing Alma payment request for order: ' + order.orderNo + '. Error: ' + e.message);
            return { error: true };
        }

        return this.handleResponse(gatewayResponse, order.orderNo);
    },

    /**
     * Build the Alma payment request payload.
     * Aligns with APM payload with Alma-specific fields:
     * billing_address in source, phone in customer, shipping address, capture flag.
     * @param {Object} order The order instance
     * @param {string} processorId The processor ID
     * @returns {Object} The payment request data
     */
    getAlmaRequest: function(order, processorId) {
        var paymentInstruments = order.getPaymentInstruments();
        var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1]
            .getPaymentTransaction().getAmount().getValue().toFixed(2);

        var rawIP = ckoHelper.getHost();
        var formattedIP = ckoHelper.formatCustomerIP(rawIP);

        var amount = ckoHelper.getFormattedPrice(
            paymentInstrumentAmount,
            order.getCurrencyCode()
        );

        var billingAddress = order.getBillingAddress();
        var shippingAddress = order.getDefaultShipment().getShippingAddress();

        // Build customer object including phone
        var customer = ckoHelper.getCustomer(order);
        if (billingAddress.getPhone()) {
            var billingCountry = billingAddress.getCountryCode().getValue().toUpperCase();
            customer.phone = {
                country_code: COUNTRY_DIAL_CODES[billingCountry] || null,
                number: billingAddress.getPhone(),
            };
        }

        return {
            amount: amount,
            currency: order.getCurrencyCode(),
            source: {
                type: 'alma',
                billing_address: {
                    address_line1: billingAddress.getAddress1(),
                    address_line2: billingAddress.getAddress2(),
                    city: billingAddress.getCity(),
                    zip: billingAddress.getPostalCode(),
                    country: billingAddress.getCountryCode().getValue(),
                },
            },
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            reference: order.orderNo,
            customer: customer,
            shipping: {
                address: {
                    address_line1: shippingAddress.getAddress1(),
                    address_line2: shippingAddress.getAddress2(),
                    city: shippingAddress.getCity(),
                    zip: shippingAddress.getPostalCode(),
                    country: shippingAddress.getCountryCode().getValue(),
                },
            },
            capture: true,
            metadata: ckoHelper.getMetadata({}, processorId),
            risk: {
                device: {
                    network: formattedIP,
                },
            },
        };
    },

    /**
     * Handle the Alma payment response.
     * Extracts the redirect URL from _links.redirect.href.
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
                'CHECKOUTCOM_ALMA ' + ckoHelper._('cko.response.data', 'cko'),
                gatewayResponse
            );

            var hasRedirectLink = Object.prototype.hasOwnProperty.call(gatewayResponse, '_links')
                && Object.prototype.hasOwnProperty.call(gatewayResponse._links, 'redirect');

            if (hasRedirectLink) {
                result.error = false;
                result.redirectUrl = gatewayResponse._links.redirect.href;
            } else {
                result.errorMessage = 'No redirect URL in Alma payment response. Payment ID: ' + gatewayResponse.id + ', Order: ' + orderNumber;
                Logger.error(result.errorMessage);
            }
        } else {
            Logger.error('Invalid or empty Alma payment response for order: ' + orderNumber);
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = almaHelper;
