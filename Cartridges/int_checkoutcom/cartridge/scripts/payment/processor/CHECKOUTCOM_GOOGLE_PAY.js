'use strict';

// API Includes
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');

// Shopper cart
var Cart = require('*/cartridge/scripts/models/CartModel');

// App
var app = require('*/cartridge/scripts/app');

// Utility
var googlePayHelper = require('*/cartridge/scripts/helpers/googlePayHelper');

/**
 * Verifies that the payment data is valid.
 * @param {Object} args The method arguments
 * @returns {Object} The form validation result
 */
function Handle(args) {
    var cart = Cart.get(args.Basket);
    var paymentMethod = args.PaymentMethodID;

    // Get the payload data
    var googlePayData = app.getForm('googlePayForm').get('data').value();

    // Proceed with transaction
    Transaction.wrap(function() {
        cart.removeExistingPaymentInstruments(paymentMethod);
        var paymentInstrument = cart.createPaymentInstrument('CHECKOUTCOM_GOOGLE_PAY', cart.getNonGiftCertificateAmount());
        paymentInstrument.paymentTransaction.custom.ckoGooglePayData = googlePayData;
    });

    return { success: true };
}

/**
 * Authorises a payment.
 * @param {Object} args The method arguments
 * @returns {Object} The payment success or failure
 */
function Authorize(args) {
    // Preparing payment parameters
    var paymentInstrument = args.PaymentInstrument;
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();

    // Add order number to the session global object
    // eslint-disable-next-line
    session.privacy.ckoOrderId = args.OrderNo;

    // Make the charge request
    var chargeResponse = googlePayHelper.handleRequest(args);
    if (chargeResponse) {
        // Create the authorization transaction
        Transaction.wrap(function() {
            paymentInstrument.paymentTransaction.custom.ckoGooglePayData = '';
            paymentInstrument.paymentTransaction.transactionID = chargeResponse.id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoActionId = chargeResponse.action_id;
            paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = null;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = true;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Authorization';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
        });

        var isResContainLinks = Object.prototype.hasOwnProperty.call(chargeResponse, '_links');
        var isResContainRedirect = isResContainLinks && Object.prototype.hasOwnProperty.call(chargeResponse._links, 'redirect');
        var redirectUrl = '';
        if (isResContainRedirect) {
            // eslint-disable-next-line
            redirectUrl = chargeResponse._links.redirect.href;
        }

        return { authorized: true, redirectURL: redirectUrl };
    }
    return { error: true };
}

// Module exports
exports.Handle = Handle;
exports.Authorize = Authorize;
