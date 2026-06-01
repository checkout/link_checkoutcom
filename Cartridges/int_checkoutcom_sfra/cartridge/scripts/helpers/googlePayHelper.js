'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var URLUtils = require('dw/web/URLUtils');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions.
 */
var googlePayHelper = {
    /**
     * Handle the payment request.
     * @param {Object} paymentData The payment data
     * @param {string} processorId The processor ID
     * @param {string} orderNumber The order number
     * @returns {boolean} The request success or failure
     */
    handleRequest: function(paymentData, processorId, orderNumber) {
        // Load the order information
        var order = OrderMgr.getOrder(orderNumber);
        var gatewayResponse = null;
        var gatewayRequest = null;
        var rawIP = ckoHelper.getHost();
        var formattedIP = ckoHelper.formatCustomerIP(rawIP);

        // Prepare the parameters
        var tokenRequest = {
            type: 'googlepay',
            token_data: JSON.parse(paymentData),
        };

        // Log the payment token request data
        ckoHelper.log(processorId + ' ' + ckoHelper._('cko.tokenrequest.data', 'cko'), tokenRequest);

        // Perform the request to the payment gateway
        var tokenResponse = ckoHelper.gatewayClientRequest(
            'cko.network.token.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            JSON.stringify(tokenRequest)
        );

        // If the request is valid, process the response
        if (tokenResponse && Object.prototype.hasOwnProperty.call(tokenResponse, 'token')) {
            var customer = ckoHelper.getCustomer(order);
            var source = {
                type: 'token',
                token: tokenResponse.token,
            };
            if (order.billingAddress && order.billingAddress.getPhone()) {
                var phone = {
                    number: order.billingAddress.getPhone()
                };
                source.phone = phone;
                customer.phone = phone;
            }

            var billingAddress = order.getBillingAddress();
            if (billingAddress) {
                source.billing_address = ckoHelper.getFormattedBillingAddress(billingAddress);
            }

            gatewayRequest = {
                source: source,
                amount: ckoHelper.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), order.getCurrencyCode()),
                currency: order.getCurrencyCode(),
                reference: order.orderNo,
                capture: ckoHelper.getValue(constants.CKO_AUTO_CAPTURE),
                customer: customer,
                risk: {
                    enabled: ckoHelper.getValue(constants.CKO_ENABLE_RISK_FLAG),
                    device: {
                        network: formattedIP
                    }
                },
                '3ds': (tokenResponse.token_format === 'pan_only') ? ckoHelper.getGooglePay3Ds() : { enabled: false },
                billing_descriptor: ckoHelper.getBillingDescriptor(),
                shipping: ckoHelper.getShipping(order),
                metadata: ckoHelper.getMetadata({}, processorId),
                success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
                failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            };

            if (ckoHelper.getValue(constants.CKO_AUTO_CAPTURE) === true) {
                gatewayRequest.capture_on = ckoHelper.getCaptureTime();
            }
            // Log the payment request data
            ckoHelper.log(processorId + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

            // Perform the request to the payment gateway
            gatewayResponse = ckoHelper.gatewayClientRequest(
                'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                gatewayRequest
            );
        }

        // Process the response
        return this.handleResponse(gatewayResponse);
    },

    /**
     * Handle the payment response.
     * @param {Object} gatewayResponse The gateway response data
     * @returns {Object} The payment success or failure
     */
    handleResponse: function(gatewayResponse) {
        // Prepare the result
        var result = {
            error: !ckoHelper.paymentSuccess(gatewayResponse),
            redirectUrl: false,
        };

        // Update customer data
        if (gatewayResponse) {
            ckoHelper.updateCustomerData(gatewayResponse);

            var isResContainLinks = Object.prototype.hasOwnProperty.call(gatewayResponse, '_links');
            var isResContainRedirect = isResContainLinks && Object.prototype.hasOwnProperty.call(gatewayResponse._links, 'redirect');
            if (isResContainRedirect) {
                result.error = false;
                // eslint-disable-next-line
                result.redirectUrl = gatewayResponse._links.redirect.href;
            }
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = googlePayHelper;
