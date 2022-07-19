'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var Cart = require('*/cartridge/scripts/models/CartModel');
var app = require('*/cartridge/scripts/app');

// Utility
var apmHelper = require('*/cartridge/scripts/helpers/apmHelper');

// APM Configuration
var apmConfig = require('*/cartridge/config/ckoApmConfig');

/**
 * Verifies that the payment data is valid.
 * @param {Object} args The method arguments
 * @returns {Object} The form validation result
 */
function Handle(args) {
    // Proceed with transaction
    var cart = Cart.get(args.Basket);
    var paymentMethod = args.PaymentMethodID;

    // Proceed with transact
    Transaction.wrap(function() {
        cart.removeExistingPaymentInstruments(paymentMethod);
        cart.createPaymentInstrument(paymentMethod, cart.getNonGiftCertificateAmount());
    });

    return { success: true };
}

/**
 * Authorises a payment.
 * @param {Object} args The method arguments
 * @returns {Object} The payment success or failure
 */
function Authorize(args) {
    // Add order Number to session
    // eslint-disable-next-line
    session.privacy.ckoOrderId = args.OrderNo;

    // Get apms form
    var paymentForm = app.getForm('alternativePaymentForm');

    // Get apm type chosen
    var apm = paymentForm.get('alternative_payments').value();
    var func = apm + 'PayAuthorization';

    // Get the required apm pay config object
    var payObject = apmConfig[func](args);

    var apmAuthResult = apmHelper.apmAuthorization(payObject, args);
    if (apmAuthResult && apmAuthResult.redirected) {
        return { redirectURL: apmAuthResult.redirectUrl };
    } else if (apmAuthResult) {
        return { success: true };
    }

    return { error: true };
}

// Local methods
exports.Handle = Handle;
exports.Authorize = Authorize;
