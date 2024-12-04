'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');

/**
 * Utility functions.
 */
var klarnaHelper = {
    /**
     * Handle the payment request.
     * @param {Object} paymentData The payment data
     * @param {string} processorId The processor ID
     * @param {string} orderNumber The order number
     * @returns {boolean} The request success or failure
     */
    handleRequest: function(paymentData, processorId, orderNumber) {
        var order = OrderMgr.getOrder(orderNumber);
        // Load the order information
        var gatewayResponse = null;
        var gatewayRequest = null;
        var Site = require('dw/system/Site');
        var ckoProcessingChannelId = Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId')
        // If the request is valid, process the response
        try {
            var errorMessage;
            if (paymentData) {
                var requestData = JSON.parse(paymentData);
                gatewayRequest = {
                    payment_context_id: requestData.paymentContext_id,
                    processing_channel_id: ckoProcessingChannelId,
                    reference: order.orderNo,
                    customer: ckoHelper.getCustomer(order),
                    capture: ckoHelper.getValue(constants.CKO_AUTO_CAPTURE),
                    risk: { enabled: ckoHelper.getValue(constants.CKO_ENABLE_RISK_FLAG) },
                    metadata: ckoHelper.getMetadata({}, processorId),
                };

                if (ckoHelper.getValue(constants.CKO_AUTO_CAPTURE) === true) {
                    gatewayRequest.capture_on = ckoHelper.getCaptureTime();
                }

                // Log the payment request data
                ckoHelper.log(processorId + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

                // Perform the request to the payment gateway
                gatewayResponse = ckoHelper.gatewayClientRequest('cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service', gatewayRequest, 'POST');

                var responseData = this.handleResponse(gatewayResponse);
                if (!responseData.error) {
                    var transactionID = responseData.transactionID;

                    var verifyServiceResponse = ckoHelper.gatewayClientRequest(
                        'cko.verify.charges.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                        { paymentToken: transactionID }
                    );

                    if (ckoHelper.paymentResponseValidation(verifyServiceResponse) && verifyServiceResponse.amount) {
                        if (verifyServiceResponse.amount === order.totalGrossPrice.multiply(100).value) {
                            return responseData;
                        }
                        errorMessage = 'Klarna Transaction amount ' + verifyServiceResponse.amount / 100 + ' doesnt match the order total amount ' + order.totalGrossPrice + ' for the order:' + order.orderNo + '. Transaction ID: ' + transactionID;
                        Logger.error(errorMessage);
                    } else {
                        errorMessage = 'The Klarna payment authorization for the order:' + order.orderNo + ' is failed. Transaction ID:' + transactionID;
                        Logger.error(errorMessage);
                    }
                }
            }
            return {
                error: true,
                errorMessage: errorMessage,
            };

            // Process the response
        } catch (error) {
            Logger.error('Error While Authorizing the klarna payment request for the order: ' + order.orderNo + '. Error Details: ' + error.message);

            return {
                error: true,
            };
        }
    },

    /**
     * Handle the payment response.
     * @param {Object} gatewayResponse The gateway response data
     * @returns {Object} The payment success or failure
     */
    handleResponse: function(gatewayResponse) {
        // Prepare the result
        var result = {
            error: !ckoHelper.paymentResponseValidation(gatewayResponse),
            redirectUrl: false,
        };

        if (gatewayResponse) {
            result.transactionID = gatewayResponse.id ? gatewayResponse.id : '';
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = klarnaHelper;
