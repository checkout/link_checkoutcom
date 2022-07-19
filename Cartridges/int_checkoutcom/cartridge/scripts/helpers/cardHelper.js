/* eslint-disable no-param-reassign */
/* eslint-disable no-undef */
'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var URLUtils = require('dw/web/URLUtils');
var CustomerMgr = require('dw/customer/CustomerMgr');
var PaymentMgr = require('dw/order/PaymentMgr');

// App
var app = require('*/cartridge/scripts/app');

// Utility
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Module cardHelper.
 */
var cardHelper = {
    /**
     * Creates Site Genesis Transaction Object.
     * @param {Object} payObject The payment data
     * @param {Object} args The request parameters
     * @returns {Object} The payment result
     */
    cardAuthorization: function(payObject, args) {
        // Perform the charge
        var cardRequest = this.handleCardRequest(payObject, args);

        // Handle apm result
        if (cardRequest) {
            var gatewayLinks = cardRequest._links;
            var redirectURL;
            // Add 3DS redirect URL to session if exists
            if (Object.prototype.hasOwnProperty.call(gatewayLinks, 'redirect')) {
                redirectURL = gatewayLinks.redirect.href;
            }
            // eslint-disable-next-line
            if (redirectURL) {
                return { authorized: true, redirected: true, redirectUrl: redirectURL };
            }

            return { authorized: true };
        }

        return null;
    },

    /**
     * Handle full charge Request to CKO API.
     * @param {Object} cardData The card data
     * @param {Object} args The request data
     * @returns {Object} The gateway response
     */
    handleCardRequest: function(cardData, args) {
        // Prepare the parameters
        var order = OrderMgr.getOrder(args.OrderNo);
        var serviceName = 'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';

        // Create billing address object
        var gatewayRequest = this.getCardRequest(cardData, args);

        // Log the payment request data
        ckoHelper.log(
            serviceName + ' - ' + ckoHelper._('cko.request.data', 'cko'),
            gatewayRequest
        );

        // Perform the request to the payment gateway
        var gatewayResponse = ckoHelper.gatewayClientRequest(
            serviceName,
            gatewayRequest
        );

        // If the charge is valid, process the response
        if (gatewayResponse) {
            Transaction.wrap(function() {
                // Create the payment instrument and processor
                var paymentInstrument = order.getPaymentInstruments();

                if (paymentInstrument[paymentInstrument.length - 1] && (paymentInstrument[paymentInstrument.length - 1].paymentTransaction.transactionID === gatewayResponse.id || paymentInstrument[paymentInstrument.length - 1].paymentTransaction.transactionID === '')) {
                    paymentInstrument = paymentInstrument[paymentInstrument.length - 1];
                } else {
                    paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
                }

                var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
                paymentInstrument.paymentTransaction.setTransactionID(gatewayResponse.id);
                paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
            });

            // Handle the response
            if (this.handleFullChargeResponse(gatewayResponse)) {
                return gatewayResponse;
            }

            return null;
        }

        // Fail the order
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });

        return null;
    },

    /**
     * Handle full charge Response from CKO API.
     * @param {Object} gatewayResponse The gateway response
     * @returns {boolean} The payment success or failure
     */
    handleFullChargeResponse: function(gatewayResponse) {
        // Update customer data
        ckoHelper.updateCustomerData(gatewayResponse);

        // Check if its a valid response
        return ckoHelper.paymentSuccess(gatewayResponse);
    },

    /**
     * Build the gateway request.
     * @param {Object} cardData The card data
     * @param {Object} args The request data
     * @returns {Object} The card request data
     */
    getCardRequest: function(cardData, args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.OrderNo);
        var paymentData = app.getForm('cardPaymentForm');
        var orderTotal = args.PaymentInstrument.paymentTransaction.amount ? args.PaymentInstrument.paymentTransaction.amount.getValue().toFixed(2) : order.totalGrossPrice.value.toFixed(2);

        if (cardData.type === 'mada') {
            if (empty(cardData)) {
                cardData = { type: 'mada' };
            } else {
                cardData.type = 'mada';
            }
        }

        // Prepare the charge data
        var chargeData = {
            source: this.getCardSource(args.PaymentInstrument),
            amount: ckoHelper.getFormattedPrice(orderTotal, ckoHelper.getCurrency()),
            currency: ckoHelper.getCurrency(),
            reference: args.OrderNo,
            capture: ckoHelper.getValue(constants.CKO_AUTO_CAPTURE),
            customer: ckoHelper.getCustomer(args),
            billing_descriptor: ckoHelper.getBillingDescriptorObject(),
            shipping: ckoHelper.getShippingObject(args),
            '3ds': (cardData.type === 'mada') ? { enabled: true } : ckoHelper.get3Ds(),
            risk: { enabled: ckoHelper.getValue(constants.CKO_ENABLE_RISK_FLAG) },
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            payment_ip: ckoHelper.getHost(args),
            metadata: ckoHelper.getMetadataObject(cardData, args),
            udf5: ckoHelper.getMetadataString(cardData, args),
        };

        if (ckoHelper.getValue(constants.CKO_AUTO_CAPTURE) === true) {
            chargeData.capture_on = ckoHelper.getCaptureTime();
        }

        // Handle the save card request
        if (paymentData.get('saveCard').value()) {
            var customer = CustomerMgr.getCustomerByCustomerNumber(order.getCustomerNo());
            var wallet = customer.getProfile().getWallet();
            var paymentInstruments = wallet.getPaymentInstruments('CREDIT_CARD');
            // Update the metadata
            chargeData.metadata.card_uuid = paymentInstruments[paymentInstruments.length - 1].getUUID(); // PaymentInstrument.UUID
            chargeData.metadata.customer_id = order.getCustomerNo(); // Order.getCustomerNo
        }

        return chargeData;
    },

    /**
     * Get a card source.
     * @param {Object} paymentInstrument The payment data
     * @returns {Object} The card source
     */
    getCardSource: function(paymentInstrument) {
        // Replace selectedCardUuid by get saved card token from selectedCardUuid
        var cardSource;
        var paymentData = app.getForm('cardPaymentForm');

        if (paymentData.get('cardToken').value() && paymentData.get('cardToken').value() !== 'false') {
            cardSource = {
                type: 'id',
                id: paymentData.get('cardToken').value(),
                cvv: paymentData.get('cvn').value(),
            };
        // eslint-disable-next-line eqeqeq
        } else if (paymentInstrument.getCreditCardToken() && paymentInstrument.getCreditCardToken() != 'undefined') {
            cardSource = {
                type: 'id',
                id: paymentInstrument.getCreditCardToken(),
                cvv: paymentData.get('cvn').value(),
            };
        } else {
            cardSource = {
                type: 'card',
                number: paymentInstrument.getCreditCardNumber(),
                expiry_month: paymentInstrument.creditCardExpirationMonth,
                expiry_year: paymentInstrument.creditCardExpirationYear,
                cvv: paymentData.get('cvn').value(),
            };
        }

        return cardSource;
    },

    /**
     * Build the billing object.
     * @param {Object} args The request data
     * @returns {Object} The billing object
     */
    getBillingObject: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.OrderNo);

        // Get billing address information
        var billingAddress = order.getBillingAddress();

        // Creating billing address object
        var billingDetails = {
            address_line1: billingAddress.getAddress1(),
            address_line2: billingAddress.getAddress2(),
            city: billingAddress.getCity(),
            state: billingAddress.getStateCode(),
            zip: billingAddress.getPostalCode(),
            country: billingAddress.getCountryCode().value,
        };

        return billingDetails;
    },
};

// Module exports
module.exports = cardHelper;
