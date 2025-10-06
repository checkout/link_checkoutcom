'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions.
 */
var cardHelper = {
    /**
     * Handle the payment request.
     * @param {string} orderNumber The order number
     * @param {Object} paymentInstrument The payment data
     * @param {string} paymentProcessor The processor ID
     * @returns {boolean} The request success or failure
     */
    handleRequest: function(orderNumber, paymentInstrument, paymentProcessor) {
        // Order number
        // eslint-disable-next-line
        orderNumber = orderNumber || null;

        // Build the request data
        var gatewayRequest = this.buildRequest(orderNumber, paymentInstrument, paymentProcessor.ID);

        // Log the payment request data
        ckoHelper.log(paymentProcessor.ID + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

        // Perform the request to the payment gateway
        var gatewayResponse = ckoHelper.gatewayClientRequest(
            'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            gatewayRequest
        );

        // Process the response
        session.privacy.deviceSessionId = null;
        return this.handleResponse(gatewayResponse);
    },

    /**
     * Handle the payment response.
     * @param {Object} gatewayResponse The gateway response data
     * @returns {Object} The payment result
     */
    handleResponse: function(gatewayResponse) {
        // Prepare the result
        var result = {
            error: !ckoHelper.paymentSuccess(gatewayResponse),
            redirectUrl: false,
            transactionID: gatewayResponse.id,
        };

        // Handle the response
        if (gatewayResponse) {
            // Update customer data
            ckoHelper.updateCustomerData(gatewayResponse);

            // Add 3DS redirect URL to session if exists
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

    /**
     * Build the gateway request.
     * @param {string} orderNumber The order number
     * @param {Object} paymentInstrument The payment data
     * @param {string} paymentProcessor The processor ID
     * @returns {Object} The payment request data
     */
    buildRequest: function(orderNumber, paymentInstrument, paymentProcessor) {
        // Load the order
        var order = OrderMgr.getOrder(orderNumber);
        var paymentData = JSON.parse(paymentInstrument.custom.ckoPaymentData);
        var rawIP = ckoHelper.getHost();
        var formattedIP = ckoHelper.formatCustomerIP(rawIP);
        var metadata;
        var udf5Metadata;
        var device_session_id;

        var riskJsEnabled = Site.getCurrent().getCustomPreferenceValue('riskJsEnabled');
        if (riskJsEnabled && session.privacy.deviceSessionId) {
            device_session_id = session.privacy.deviceSessionId;
        }

        var source = this.getCardSource(paymentInstrument);
        var customer = ckoHelper.getCustomer(order);

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

        if (paymentData.saveCard === false) {
            if (paymentData.madaCard === true) {
                metadata = ckoHelper.getMetadata({ type: 'mada' }, paymentProcessor, paymentInstrument);
                udf5Metadata = ckoHelper.getMetadataString({ type: 'mada' }, paymentProcessor);
            } else {
                metadata = ckoHelper.getMetadata({}, paymentProcessor, paymentInstrument);
                udf5Metadata = ckoHelper.getMetadataString(paymentData, paymentProcessor);
            }
        } else {
            var cardBinNumber = paymentData.cardBin;
            var madaCard = ckoHelper.isMadaCard(cardBinNumber, { type: 'creditCard' });

            if (madaCard === true) {
                metadata = ckoHelper.getMetadata({ type: 'mada' }, paymentProcessor, paymentInstrument);
                udf5Metadata = ckoHelper.getMetadataString({ type: 'mada' }, paymentProcessor);
            } else {
                metadata = ckoHelper.getMetadata({}, paymentProcessor, paymentInstrument);
                udf5Metadata = ckoHelper.getMetadataString(paymentData, paymentProcessor);
            }
        }

        // Prepare the charge data
        var chargeData = {
            source: source,
            amount: ckoHelper.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), order.getCurrencyCode()),
            currency: order.getCurrencyCode(),
            reference: orderNumber,
            capture: ckoHelper.getValue(constants.CKO_AUTO_CAPTURE),
            customer: customer,
            billing_descriptor: ckoHelper.getBillingDescriptor(),
            shipping: ckoHelper.getShipping(order),
            '3ds': (paymentData.madaCard === true) ? { enabled: true } : ckoHelper.get3Ds(),
            risk: {
                device_session_id : device_session_id,
                enabled: ckoHelper.getValue(constants.CKO_ENABLE_RISK_FLAG),
                device: {
                    network: formattedIP
                }
             },
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            metadata: metadata,
            udf5: udf5Metadata,
        };

        if (ckoHelper.getValue(constants.CKO_AUTO_CAPTURE) === true) {
            chargeData.capture_on = ckoHelper.getCaptureTime();
        }

        if (paymentData.type === 'Cartes Bancaires') {
            var processing = {
                "preferred_scheme": "cartes_bancaires"
            };
            chargeData.processing = processing;
        }
        
        // Handle the save card request
        if (paymentData.saveCard) {
            // Update the metadata
            chargeData.metadata.card_uuid = paymentData.storedPaymentUUID;
            chargeData.metadata.customer_id = paymentData.customerNo;
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
        var paymentData = JSON.parse(paymentInstrument.custom.ckoPaymentData);

        if (paymentData.securityCode && paymentData.saveCard) {
            cardSource = {
                type: 'id',
                id: paymentInstrument.creditCardToken,
                cvv: paymentData.securityCode,
                name: paymentInstrument.creditCardHolder,
            };
        } else {
            cardSource = {
                type: 'card',
                number: paymentInstrument.creditCardNumber,
                expiry_month: paymentInstrument.creditCardExpirationMonth,
                expiry_year: paymentInstrument.creditCardExpirationYear,
                cvv: paymentData.securityCode,
                name: paymentInstrument.creditCardHolder,
            };
        }

        return cardSource;
    },
};

/**
 * Module exports
 */
module.exports = cardHelper;
