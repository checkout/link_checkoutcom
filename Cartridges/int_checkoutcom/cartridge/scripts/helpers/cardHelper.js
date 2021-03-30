'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');

// Utility
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');

/**
 * Module cardHelper.
 */
var cardHelper = {
    /**
     * Creates Site Genesis Transaction Object.
     * @param {Object} paymentInstrument The payment instrument
     * @param {Object} args The request parameters
     * @returns {Object} The payment result
     */
    cardAuthorization: function(paymentInstrument, args) {
        // Perform the charge
        var cardRequest = this.handleCardRequest(paymentInstrument, args);

        // Handle apm result
        if (cardRequest) {
            // eslint-disable-next-line
            if (session.privacy.redirectUrl) {
                // 3ds redirection
                ISML.renderTemplate('redirects/3DSecure.isml', {
                    // eslint-disable-next-line
                    redirectUrl: session.privacy.redirectUrl,
                });

                return { authorized: true, redirected: true };
            }

            return { authorized: true };
        }

        return null;
    },

    /**
     * Handle full charge Request to CKO API.
     * @param {Object} paymentInstrument The card paymentInstrument
     * @param {Object} args The request data
     * @returns {Object} The gateway response
     */
    handleCardRequest: function(paymentInstrument, args) {
        // Prepare the parameters
        var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);
        var serviceName = 'cko.card.charge.' + ckoHelper.getValue('ckoMode') + '.service';

        // Create billing address object
        var gatewayRequest = this.getCardRequest(paymentInstrument, args);

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
     * @param {Object} paymentInstrument The card data
     * @param {Object} args The request data
     * @returns {Object} The card request data
     */
    getCardRequest: function(paymentInstrument, args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);
        var paymentData = JSON.parse(paymentInstrument.custom.ckoPaymentData);

        // Prepare the charge data
        var chargeData = {
            source: this.getSourceObject(paymentInstrument, args),
            amount: ckoHelper.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), ckoHelper.getCurrency()),
            currency: ckoHelper.getCurrency(),
            reference: args.OrderNo,
            capture: ckoHelper.getValue('ckoAutoCapture'),
            capture_on: ckoHelper.getValue('ckoAutoCapture') ? ckoHelper.getCaptureTime() : null,
            customer: ckoHelper.getCustomer(args),
            billing_descriptor: ckoHelper.getBillingDescriptorObject(),
            shipping: this.getShippingObject(args),
            '3ds': paymentData.madaCard === 'yes' ? { enabled: true } : this.get3Ds(),
            risk: { enabled: Site.getCurrent().getCustomPreferenceValue('ckoEnableRiskFlag') },
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            payment_ip: ckoHelper.getHost(args),
            metadata: ckoHelper.getMetadataObject(paymentInstrument, args),
            udf5: ckoHelper.getMetadataString(paymentInstrument, args),
        };

        return chargeData;
    },

    /**
     * Build Gateway Source Object.
     * @param {Object} paymentInstrument The card paymentInstrument
     * @param {Object} args The request data
     * @returns {Object} The source object
     */
    getSourceObject: function(paymentInstrument, args) {
        var paymentData = JSON.parse(paymentInstrument.custom.ckoPaymentData);
        // Source object
        var source = {
            type: 'card',
            number: paymentInstrument.creditCardNumber,
            expiry_month: paymentInstrument.creditCardExpirationMonth,
            expiry_year: paymentInstrument.creditCardExpirationYear,
            name: paymentInstrument.creditCardHolder,
            cvv: paymentData.cvn,
            billing_address: this.getBillingObject(args),
            phone: ckoHelper.getPhoneObject(args),
        };

        return source;
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
        var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);

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
        var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);

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
