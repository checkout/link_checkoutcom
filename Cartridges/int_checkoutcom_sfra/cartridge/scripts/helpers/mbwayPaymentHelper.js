'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var Site = require('dw/system/Site');
var URLUtils = require('dw/web/URLUtils'); // used for success_url / failure_url
var Logger = require('dw/system/Logger').getLogger('ckoPayments');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions for MB WAY payment processing.
 */
var mbwayPaymentHelper = {
    /**
     * Handle the MB WAY payment request.
     * @param {string} processorId The processor ID
     * @param {string} orderNumber The order number
     * @returns {Object} The request result with error, transactionID and mbwayPending flag
     */
    handleRequest: function(processorId, orderNumber) {
        var order = OrderMgr.getOrder(orderNumber);
        var gatewayResponse = null;

        try {
            var billingAddress = order.getBillingAddress();
            var paymentInstruments = order.getPaymentInstruments();
            var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1]
                .getPaymentTransaction().getAmount().getValue().toFixed(2);
            var rawIP = ckoHelper.getHost();
            var formattedIP = ckoHelper.formatCustomerIP(rawIP);
            var ckoProcessingChannelId = Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId');

            var amount = ckoHelper.getFormattedPrice(
                paymentInstrumentAmount,
                order.getCurrencyCode()
            );

            var gatewayRequest = {
                source: {
                    type: 'mbway',
                },
                amount: amount,
                currency: order.getCurrencyCode(),
                reference: order.orderNo,
                customer: {
                    email: ckoHelper.getCustomer(order).email,
                    name: ckoHelper.getCustomer(order).name,
                    phone: {
                        country_code: '777',
                        number: billingAddress.getPhone(),
                    },
                },
                processing_channel_id: ckoProcessingChannelId,
                success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
                failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
                metadata: ckoHelper.getMetadata({}, processorId),
                billing_descriptor: ckoHelper.getBillingDescriptor(),
                risk: {
                    device: {
                        network: formattedIP,
                    },
                },
            };

            // Log the payment request data
            ckoHelper.log(
                processorId + ' ' + ckoHelper._('cko.request.data', 'cko'),
                gatewayRequest
            );

            // Perform the request to the payment gateway
            gatewayResponse = ckoHelper.gatewayClientRequest(
                'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                gatewayRequest
            );

            return this.handleResponse(gatewayResponse);
        } catch (error) {
            Logger.error('Error while authorizing MB WAY payment for order: ' + orderNumber + '. Error: ' + error.message);
            return {
                error: true,
                transactionID: '',
                mbwayPending: false,
            };
        }
    },

    /**
     * Handle the MB WAY payment response.
     * @param {Object} gatewayResponse The gateway response
     * @returns {Object} The result with error, transactionID and mbwayPending flag
     */
    handleResponse: function(gatewayResponse) {
        var result = {
            error: true,
            transactionID: '',
            redirectUrl: false,
        };

        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'id')) {
            result.transactionID = gatewayResponse.id;

            // MB WAY returns HTTP 202 Accepted with status 'Pending' — no response_code in the response.
            // Signal mbwayPending so CheckoutServices returns order details to the client for inline polling.
            if (gatewayResponse.status === 'Pending') {
                result.error = false;
                result.mbwayPending = true;
            }
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = mbwayPaymentHelper;
