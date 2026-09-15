'use strict';

/* API Includes */
var Status = require('dw/system/Status');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/**
 * SCAPI Shopper Baskets payment-instrument hooks.
 * Headless storefronts (Storefront Next / PWA Kit) add payment instruments via
 * SCAPI instead of the SFRA billing form, so the form processors never run.
 * These hooks validate the request and attach the Checkout.com payment context
 * (ckoPaymentData) that the app.payment.processor Authorize hooks expect.
 */

/**
 * Get the payment processor id for a payment method.
 * @param {string} paymentMethodId The payment method id
 * @returns {string|null} The processor id, or null when unresolvable
 */
function getProcessorId(paymentMethodId) {
    var method = PaymentMgr.getPaymentMethod(paymentMethodId);
    var processor = method && method.getPaymentProcessor();
    return processor ? processor.getID() : null;
}

/**
 * Whether the payment method is handled by this integration.
 * @param {string} paymentMethodId The payment method id
 * @returns {boolean} Whether the method's processor is a Checkout.com processor
 */
function isCkoMethod(paymentMethodId) {
    var processorId = getProcessorId(paymentMethodId);
    return !!(processorId && processorId.indexOf('CHECKOUTCOM_') === 0);
}

/**
 * Validate a payment instrument request before the platform creates the instrument.
 * @param {dw.order.Basket} basket The current basket
 * @param {Object} paymentInstrumentRequest The OCAPI payment instrument request document
 * @returns {dw.system.Status} The hook status
 */
exports.beforePOST = function(basket, paymentInstrumentRequest) {
    var paymentMethodId = paymentInstrumentRequest.paymentMethodId;
    if (!paymentMethodId || !isCkoMethod(paymentMethodId)) {
        // Not a Checkout.com method: let the platform and other cartridges handle it
        return new Status(Status.OK);
    }

    var method = PaymentMgr.getPaymentMethod(paymentMethodId);
    if (!method || !method.isActive()) {
        return new Status(Status.ERROR, 'CKO_METHOD_NOT_ACTIVE', Resource.msg('error.payment.not.valid', 'checkout', null));
    }

    return new Status(Status.OK);
};

/**
 * Attach the Checkout.com payment context to the created payment instrument.
 * The storefront passes gateway data as custom properties on the request
 * (c_ckoToken from Frames tokenization, c_deviceSessionId from Risk.js, etc.);
 * this hook translates them into the ckoPaymentData blob the
 * app.payment.processor Authorize hooks consume.
 * @param {dw.order.Basket} basket The current basket
 * @param {Object} paymentInstrumentRequest The OCAPI payment instrument request document
 * @returns {dw.system.Status} The hook status
 */
exports.afterPOST = function(basket, paymentInstrumentRequest) {
    var paymentMethodId = paymentInstrumentRequest.paymentMethodId;
    if (!paymentMethodId || !isCkoMethod(paymentMethodId)) {
        return new Status(Status.OK);
    }

    // The instrument just created by the platform is the last one for this method
    var instruments = basket.getPaymentInstruments(paymentMethodId);
    if (instruments.empty) {
        return new Status(Status.OK);
    }
    var paymentInstrument = instruments[instruments.length - 1];

    var cardBin = paymentInstrumentRequest.c_cardBin || null;
    var madaCard = false;
    if (cardBin) {
        try {
            madaCard = ckoHelper.isMadaCard(cardBin, { type: 'creditCard' }) === true;
        } catch (e) {
            madaCard = false;
        }
    }

    var customer = basket.getCustomer();
    var paymentData = {
        // Card (Frames token) data
        ckoToken: paymentInstrumentRequest.c_ckoToken || null,
        deviceSessionId: paymentInstrumentRequest.c_deviceSessionId || null,
        saveCard: paymentInstrumentRequest.c_saveCard === true,
        storedPaymentUUID: paymentInstrumentRequest.c_storedPaymentUUID || null,
        type: paymentInstrumentRequest.c_cardType
            || (paymentInstrumentRequest.paymentCard ? paymentInstrumentRequest.paymentCard.cardType : null),
        securityCode: null,
        customerNo: customer && customer.registered && customer.profile ? customer.profile.customerNo : null,
        madaCard: madaCard,
        cardBin: cardBin,
        // Method-specific data previously carried in session.privacy
        ckoTabbyContextId: paymentInstrumentRequest.c_ckoTabbyContextId || null,
        ckoTabbyPaymentType: paymentInstrumentRequest.c_ckoTabbyPaymentType || null,
        sequraProductType: paymentInstrumentRequest.c_sequraProductType || null,
        apmType: paymentInstrumentRequest.c_apmType || null,
    };

    Transaction.wrap(function() {
        paymentInstrument.custom.ckoPaymentData = JSON.stringify(paymentData);
    });

    return new Status(Status.OK);
};
