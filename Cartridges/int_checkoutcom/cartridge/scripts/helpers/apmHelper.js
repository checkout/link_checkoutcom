'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var URLUtils = require('dw/web/URLUtils');
var PaymentMgr = require('dw/order/PaymentMgr');

// Utility
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * APM utility funnctions.
 */
var apmHelper = {
    /**
     * Creates Site Genesis Transaction Object.
     * @param {Object} payObject The transaction parameters
     * @param {Object} args The transaction arguments
     * @returns {boolean} Payment success or failure
     */
    apmAuthorization: function(payObject, args) {
        // Perform the charge
        var apmRequest = this.handleApmRequest(payObject, args);

        // Handle apm result
        if (apmRequest) {
            if (this.handleApmChargeResponse(apmRequest)) {
                // eslint-disable-next-line
                var gatewayLinks = apmRequest._links;
                var type = apmRequest.type;
                var redirectURL;
                if (type === 'Sepa') {
                    redirectURL = URLUtils.url('CKOSepa-Mandate').toString(); // eslint-disable-line
                }
                if (Object.prototype.hasOwnProperty.call(gatewayLinks, 'redirect')) {
                    redirectURL = gatewayLinks.redirect.href;
                }
                if (redirectURL) {
                    return { authorized: true, redirected: true, redirectUrl: redirectURL, response: apmRequest };
                }

                return { authorized: true, response: apmRequest };
            }

            return false;
        }

        return false;
    },

    /**
     * Handle APM charge Response from CKO API.
     * @param {Object} gatewayResponse The gateway response
     * @returns {boolean} Payment success or failure
     */
    handleApmChargeResponse: function(gatewayResponse) {
        // Clean the session
        // eslint-disable-next-line

        // Update customer data
        ckoHelper.updateCustomerData(gatewayResponse);

        // Get the response type
        var type = gatewayResponse.type;

        // Add redirect to sepa source reqeust
        if (type === 'Sepa') {
            session.privacy.sepaResponseId = gatewayResponse.id; // eslint-disable-line
        }

        return ckoHelper.paymentSuccess(gatewayResponse);
    },

    /**
     * Apm Request.
     * @param {Object} payObject The transaction parameters
     * @param {Object} args The transaction arguments
     * @returns {Object} The gateway response
     */
    handleApmRequest: function(payObject, args) {
        // Gateway response
        var gatewayResponse = false;
        var serviceName;

        // Load the card and order information
        var order = OrderMgr.getOrder(args.OrderNo);

        // Creating billing address object
        var gatewayRequest = this.getApmRequest(payObject, args);

        // Log the payment request data
        ckoHelper.log(serviceName + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

        // Prepare the service name (test for SEPA)
        serviceName = Object.prototype.hasOwnProperty.call(payObject, 'type') && payObject.type === 'sepa'
        ? 'cko.card.sources.'
        : 'cko.card.charge.';

        // Perform the request to the payment gateway
        serviceName += ckoHelper.getValue(constants.CKO_MODE) + '.service';
        gatewayResponse = ckoHelper.gatewayClientRequest(serviceName, gatewayRequest);

        // If the charge is valid, process the response
        if (gatewayResponse) {
            Transaction.wrap(function() {
                // Create the payment instrument and processor
                var paymentInstrument = order.getPaymentInstruments();

                if (paymentInstrument[0] && (paymentInstrument[0].paymentTransaction.transactionID === gatewayResponse.id || paymentInstrument[0].paymentTransaction.transactionID === '')) {
                    paymentInstrument = paymentInstrument[0];
                }

                var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
                paymentInstrument.paymentTransaction.setTransactionID(gatewayResponse.id);
                paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
            });
            return gatewayResponse;
        }

        // Update the transaction
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });

        return null;
    },

    /**
     * Return the APM request data.
     * @param {Object} payObject The transaction parameters
     * @param {Object} args The transaction arguments
     * @returns {Object} The gateway request
     */
    getApmRequest: function(payObject, args) {
        // Charge data
        var chargeData = false;

        // Load the order information
        var order = OrderMgr.getOrder(args.OrderNo);
        var paymentInstruments = order.getPaymentInstruments();
        var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1].getPaymentTransaction().getAmount().getValue().toFixed(2);

        // Load the currency and amount
        var amount = ckoHelper.getFormattedPrice(paymentInstrumentAmount, payObject.currency);

        // Object APM is SEPA
        if (Object.prototype.hasOwnProperty.call(payObject, 'type') && payObject.type === 'sepa') {
            // Prepare the charge data
            chargeData = {
                customer: ckoHelper.getCustomer(args),
                amount: amount,
                type: payObject.type,
                currency: payObject.currency,
                billing_address: ckoHelper.getBillingObject(args),
                source_data: payObject.source_data,
                reference: args.OrderNo,
                payment_ip: ckoHelper.getHost(args),
                metadata: ckoHelper.getMetadataObject(payObject, args),
                billing_descriptor: ckoHelper.getBillingDescriptorObject(),
                udf5: ckoHelper.getMetadataString(payObject, args),
            };
        } else if (Object.prototype.hasOwnProperty.call(payObject, 'type') && payObject.source.type === 'klarna') {
            // Prepare chargeData object
            chargeData = {
                customer: ckoHelper.getCustomer(args),
                amount: amount,
                currency: payObject.currency,
                capture: false,
                source: payObject.source,
                reference: args.OrderNo,
                payment_ip: ckoHelper.getHost(args),
                metadata: ckoHelper.getMetadataObject(payObject, args),
                billing_descriptor: ckoHelper.getBillingDescriptorObject(),
                success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
                failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            };
        } else {
            // Prepare chargeData object
            chargeData = {
                customer: ckoHelper.getCustomer(args),
                amount: amount,
                currency: payObject.currency,
                source: payObject.source,
                reference: args.OrderNo,
                payment_ip: ckoHelper.getHost(args),
                metadata: ckoHelper.getMetadataObject(payObject, args),
                billing_descriptor: ckoHelper.getBillingDescriptorObject(),
                success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
                failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            };
        }

        return chargeData;
    },

    /**
     * Sepa controller Request.
     * @param {Object} payObject The transaction parameters
     * @param {Object} order The order instance
     * @returns {Object} The gateway response
     */
    handleSepaControllerRequest: function(payObject, order) {
        // Gateway response
        var gatewayResponse = null;

        // Perform the request to the payment gateway
        gatewayResponse = ckoHelper.gatewayClientRequest(
            'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            payObject
        );

        // If the charge is valid, process the response
        if (gatewayResponse) {
            return gatewayResponse;
        }

        // Update the transaction
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });

        return null;
    },
};

// Module exports
module.exports = apmHelper;
