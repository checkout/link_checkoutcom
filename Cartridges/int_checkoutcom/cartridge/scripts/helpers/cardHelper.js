'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var CustomerMgr = require('dw/customer/CustomerMgr');
var Site = require('dw/system/Site');

// App
var app = require('*/cartridge/scripts/app');

// Utility
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');

/**
 * Module cardHelper.
 */
var cardHelper = {
    /**
     * Creates a token. This should be replaced by utilizing a tokenization provider
     * @param {Object} paymentData The data of the payment
     * @returns {string} a token
     */
    createToken: function(paymentData) {

       var requestData = {
           source: {
               type: 'card',
               number: paymentData.cardNumber.toString(),
               expiry_month: paymentData.expirationMonth,
               expiry_year: paymentData.expirationYear,
               name: paymentData.name,
           },
           currency: Site.getCurrent().getDefaultCurrency(),
           customer: {
               name: paymentData.name,
               email: paymentData.email,
           },
       };

       var idResponse = ckoHelper.gatewayClientRequest(
           'cko.card.charge.' + ckoHelper.getValue('ckoMode') + '.service',
           requestData
       );
     
       if (idResponse && idResponse !== 400) {
           return idResponse.source.id;
       }

       return '';
    },

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
            // eslint-disable-next-line
            if (session.privacy.redirectUrl) {
                // 3ds redirection
                ISML.renderTemplate('redirects/3DSecure.isml', {
                    // eslint-disable-next-line
                    redirectUrl: session.privacy.redirectUrl,
                });

                return { authorized: false, redirected: true };
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
        var serviceName = 'cko.card.charge.' + ckoHelper.getValue('ckoMode') + '.service';

        // Create billing address object
        var gatewayRequest = this.getCardRequest(cardData, args);

        // Log the payment response data
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
            // Log the payment response data
            ckoHelper.log(
                serviceName + ' - ' + ckoHelper._('cko.response.data', 'cko'),
                gatewayResponse
            );

            Transaction.wrap(function() {
                // Create the payment instrument and processor
                var paymentInstrument = order.getPaymentInstruments();

                if (paymentInstrument[paymentInstrument.length - 1] && (paymentInstrument[paymentInstrument.length - 1].paymentTransaction.transactionID === gatewayResponse.id || paymentInstrument[paymentInstrument.length - 1].paymentTransaction.transactionID === '')) {
                    paymentInstrument = paymentInstrument[paymentInstrument.length - 1];
                } else {
                    paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
                }

                paymentInstrument.paymentTransaction.setTransactionID(gatewayResponse.id);
            });

            // Handle the response
            if (this.handleFullChargeResponse(gatewayResponse)) {
                return gatewayResponse;
            }
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
        // Clean the session
        // eslint-disable-next-line
        session.privacy.redirectUrl = null;

        // Update customer data
        ckoHelper.updateCustomerData(gatewayResponse);

        // Get the gateway links
        // eslint-disable-next-line
        var gatewayLinks = gatewayResponse._links;

        // Add 3DS redirect URL to session if exists
        if (Object.prototype.hasOwnProperty.call(gatewayLinks, 'redirect')) {
            // Save redirect link to session
            // eslint-disable-next-line
            session.privacy.redirectUrl = gatewayLinks.redirect.href;

            // Check if its a valid response
            return ckoHelper.paymentSuccess(gatewayResponse);
        }

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

        // Prepare the charge data
        var chargeData = {
            source: this.getCardSource(args.PaymentInstrument),
            amount: ckoHelper.getFormattedPrice(orderTotal, ckoHelper.getCurrency()),
            currency: ckoHelper.getCurrency(),
            reference: args.OrderNo,
            capture: (paymentData.madaCard === true) ? '' : ckoHelper.getValue('ckoAutoCapture'),
            capture_on: (paymentData.madaCard === true) ? '' : ckoHelper.getCaptureTime(),
            customer: ckoHelper.getCustomer(args),
            billing_descriptor: ckoHelper.getBillingDescriptorObject(),
            shipping: this.getShippingObject(args),
            '3ds': (cardData.type === 'mada') ? { enabled: true } : this.get3Ds(),
            risk: { enabled: ckoHelper.getValue('ckoEnableRiskFlag') },
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            payment_ip: ckoHelper.getHost(args),
            metadata: ckoHelper.getMetadataObject(cardData, args),
            udf5: ckoHelper.getMetadataString(cardData, args),
        };

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

        if (paymentData.get('cardToken').value() && paymentData.get('cardToken').value() !== 'false' ) {
            cardSource = {
                type: 'id',
                id: paymentData.get('cardToken').value(),
                cvv: paymentData.get('cvn').value(),
            };
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
     * Build 3ds object.
     * @returns {Object} The 3ds object
     */
    get3Ds: function() {
        return {
            enabled: ckoHelper.getValue('cko3ds'),
            attempt_n3d: ckoHelper.getValue('ckoN3ds'),
        };
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

    /**
     * Build the shipping object.
     * @param {Object} args The request data
     * @returns {Object} The shipping object
     */
    getShippingObject: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.OrderNo);

        // Get shipping address object
        var shippingAddress = order.getDefaultShipment().getShippingAddress();

        // Creating address object
        var shippingDetails = {
            address_line1: shippingAddress.getAddress1(),
            address_line2: shippingAddress.getAddress2(),
            city: shippingAddress.getCity(),
            state: shippingAddress.getStateCode(),
            zip: shippingAddress.getPostalCode(),
            country: shippingAddress.getCountryCode().value,
        };

        // Build the shipping object
        var shipping = {
            address: shippingDetails,
            phone: ckoHelper.getPhoneObject(args),
        };

        return shipping;
    },
};

// Module exports
module.exports = cardHelper;
