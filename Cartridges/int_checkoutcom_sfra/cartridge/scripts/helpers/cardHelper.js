'use strict';

/* API Includes */
/* global session */
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

        if (!gatewayRequest) {
            // No security code for the card: nothing is sent to the gateway
            session.privacy.deviceSessionId = null;

            return { error: true, redirectUrl: false, transactionID: null };
        }

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
            transactionID: gatewayResponse ? gatewayResponse.id : null,
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

        if (!source) {
            return null;
        }

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

        // Mada, decided here from the card actually charged (the stored BIN of a
        // saved card, the number of a new one), the same way for both: never a
        // flag computed earlier nor anything of the shopper's request
        var madaCard = this.isMadaPayment(paymentInstrument, paymentData, source);

        if (madaCard) {
            metadata = ckoHelper.getMetadata({ type: 'mada' }, paymentProcessor, paymentInstrument);
            udf5Metadata = ckoHelper.getMetadataString({ type: 'mada' }, paymentProcessor);
        } else {
            metadata = ckoHelper.getMetadata({}, paymentProcessor, paymentInstrument);
            udf5Metadata = ckoHelper.getMetadataString(paymentData, paymentProcessor);
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
            // A Mada payment is always challenged (3DS forced, no attempt_n3d)
            '3ds': madaCard ? { enabled: true } : ckoHelper.get3Ds(),
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
     * Whether a card security code has the format of the card type: 4 digits
     * for American Express, 3 for the other schemes.
     * @param {string} securityCode The security code
     * @param {string} cardType The SFCC card type
     * @returns {boolean} True when it is valid
     */
    isValidSecurityCode: function(securityCode, cardType) {
        var isAmex = /amex|american/i.test(String(cardType || ''));

        return (isAmex ? /^\d{4}$/ : /^\d{3}$/).test(String(securityCode || ''));
    },

    /**
     * Whether the card charged is a Mada card.
     * @param {Object} paymentInstrument The payment instrument
     * @param {Object} paymentData The instrument's ckoPaymentData
     * @param {Object} source The card source sent to the gateway
     * @returns {boolean} True for a Mada card
     */
    isMadaPayment: function(paymentInstrument, paymentData, source) {
        var bin = source.type === 'id'
            ? paymentData.cardBin
            : String(paymentInstrument.creditCardNumber || '').replace(/\D/g, '');

        return !!bin && ckoHelper.isMadaCard(String(bin), { type: 'creditCard' }) === true;
    },

    /**
     * Whether the card is charged by its token: a card saved in the shopper's
     * wallet, or a new card being saved (tokenized by Handle).
     * @param {Object} paymentInstrument The payment instrument
     * @param {Object} paymentData The instrument's ckoPaymentData
     * @returns {boolean} True when the source is the card's token
     */
    usesCardToken: function(paymentInstrument, paymentData) {
        if (!paymentInstrument.creditCardToken) {
            return false;
        }

        return paymentData.storedCard === true || !!paymentData.storedPaymentUUID || !!paymentData.saveCard;
    },

    /**
     * Get a card source. A saved card is charged by its token, a new card by its
     * number, whichever is decided by how the card was selected; either way the
     * security code is required.
     * @param {Object} paymentInstrument The payment data
     * @returns {Object|null} The card source, or null when there is no security code
     */
    getCardSource: function(paymentInstrument) {
        var paymentData = JSON.parse(paymentInstrument.custom.ckoPaymentData);
        // From the session (Handle); a basket from before this change still has it in its data
        var securityCode = this.takeSecurityCode() || paymentData.securityCode || null;

        if (!securityCode) {
            return null;
        }

        if (this.usesCardToken(paymentInstrument, paymentData)) {
            return {
                type: 'id',
                id: paymentInstrument.creditCardToken,
                cvv: securityCode,
                name: paymentInstrument.creditCardHolder,
            };
        }

        return {
            type: 'card',
            number: paymentInstrument.creditCardNumber,
            expiry_month: paymentInstrument.creditCardExpirationMonth,
            expiry_year: paymentInstrument.creditCardExpirationYear,
            cvv: securityCode,
            name: paymentInstrument.creditCardHolder,
        };
    },

    /**
     * Keep the card security code for the authorization, which runs in a later
     * request (place order). It stays in the session only, in memory: it is never
     * written to the basket, the order or any log.
     * @param {string} securityCode The CVV entered with the payment details
     */
    holdSecurityCode: function(securityCode) {
        session.privacy.ckoCardSecurityCode = securityCode ? String(securityCode) : null;
    },

    /**
     * Read the held security code once, and forget it.
     * @returns {string|null} The CVV, or null
     */
    takeSecurityCode: function() {
        var securityCode = session.privacy.ckoCardSecurityCode || null;

        session.privacy.ckoCardSecurityCode = null;

        return securityCode;
    },
};

/**
 * Module exports
 */
module.exports = cardHelper;
