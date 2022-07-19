'use strict';


// API Includes
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var URLUtils = require('dw/web/URLUtils');

// Utility
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Module googlePayHelper
 */
var googlePayHelper = {
    /**
     * Handle full charge Request to CKO API
     * @param {Object} args The request arguments
     * @returns {Object} The gateway response
     */
    handleRequest: function(args) {
        // load the order information
        var order = OrderMgr.getOrder(args.OrderNo);
        var paymentInstrument = args.PaymentInstrument;
        var ckoGooglePayData = paymentInstrument.paymentTransaction.custom.ckoGooglePayData;
        var orderTotal = paymentInstrument.paymentTransaction.amount ? paymentInstrument.paymentTransaction.amount.getValue().toFixed(2) : order.totalGrossPrice.value.toFixed(2);

        // Prepare the parameters
        var requestData = {
            type: 'googlepay',
            token_data: JSON.parse(ckoGooglePayData),
        };

        // Perform the request to the payment gateway
        var tokenResponse = ckoHelper.gatewayClientRequest(
            'cko.network.token.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            JSON.stringify(requestData)
        );

        // If the request is valid, process the response
        if (tokenResponse && Object.prototype.hasOwnProperty.call(tokenResponse, 'token')) {
            var chargeData = {
                source: ckoHelper.getSourceObject(tokenResponse),
                amount: ckoHelper.getFormattedPrice(orderTotal, ckoHelper.getCurrency()),
                currency: ckoHelper.getCurrency(),
                reference: args.OrderNo,
                capture: ckoHelper.getValue(constants.CKO_AUTO_CAPTURE),
                customer: ckoHelper.getCustomer(args),
                '3ds': (tokenResponse.token_format === 'pan_only') ? ckoHelper.getGooglePay3Ds() : { enabled: false },
                billing_descriptor: ckoHelper.getBillingDescriptorObject(),
                shipping: ckoHelper.getShippingObject(args),
                payment_ip: ckoHelper.getHost(args),
                metadata: ckoHelper.getMetadataObject([], args),
                success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
                failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            };

            if (ckoHelper.getValue(constants.CKO_AUTO_CAPTURE) === true) {
                chargeData.capture_on = ckoHelper.getCaptureTime();
            }

            // Perform the request to the payment gateway
            var gatewayResponse = ckoHelper.gatewayClientRequest(
                'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                chargeData
            );

            // Validate the response
            if (ckoHelper.paymentSuccess(gatewayResponse)) {
                ckoHelper.updateCustomerData(gatewayResponse);
                return gatewayResponse;
            }

            return null;
        }

            // Update the transaction
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });

        return null;
    },
};

// Module exports
module.exports = googlePayHelper;
