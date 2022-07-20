'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions.
 */
var applePayHelper = {
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
        var paymentInstruments = order.getPaymentInstruments();
        var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1].getPaymentTransaction().getAmount().getValue().toFixed(2);

        // Prepare the parameters
        var tokenRequest = {
            type: 'applepay',
            token_data: paymentData,
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
            var cardBin;
            var madaCard;
            var metadata;
            if (tokenResponse.bin) {
                cardBin = tokenResponse.bin;
                madaCard = ckoHelper.isMadaCard(cardBin, { type: 'applePay' });

                if (madaCard === true) {
                    metadata = ckoHelper.getMetadata({ type: 'mada' }, processorId);
                } else {
                    metadata = ckoHelper.getMetadata({}, processorId);
                }
            }

            gatewayRequest = {
                source: {
                    type: 'token',
                    token: tokenResponse.token,
                },
                amount: ckoHelper.getFormattedPrice(paymentInstrumentAmount, order.getCurrencyCode()),
                currency: order.getCurrencyCode(),
                reference: order.orderNo,
                capture: ckoHelper.getValue(constants.CKO_AUTO_CAPTURE),
                customer: ckoHelper.getCustomer(order),
                billing_descriptor: ckoHelper.getBillingDescriptor(),
                shipping: ckoHelper.getShipping(order),
                metadata: metadata,
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
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = applePayHelper;
