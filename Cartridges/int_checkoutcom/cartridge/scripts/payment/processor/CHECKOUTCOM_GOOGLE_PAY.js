'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');

// Site controller
var Site = require('dw/system/Site');
var SiteControllerName = Site.getCurrent().getCustomPreferenceValue('ckoSgStorefrontControllers');

// Shopper cart
var Cart = require(SiteControllerName + '/cartridge/scripts/models/CartModel');

// App
var app = require(SiteControllerName + '/cartridge/scripts/app');

// Utility
var googlePayHelper = require('~/cartridge/scripts/helpers/googlePayHelper');

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
        var paymentInstrument = cart.createPaymentInstrument(paymentMethod, cart.getNonGiftCertificateAmount());
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
    // Add order Number to session
    // eslint-disable-next-line
    session.privacy.ckoOrderId = args.OrderNo;
    var paymentInstrument = args.PaymentInstrument;
    var paymentMethod = paymentInstrument.getPaymentMethod();
    var PaymentMgr = require('dw/order/PaymentMgr');
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethod).getPaymentProcessor();

    try {
        var paymentAuth = googlePayHelper.handleRequest(args);

        if (paymentAuth !== '' && paymentAuth !== undefined && paymentAuth !== null) {
            Transaction.wrap(function() {
                paymentInstrument.paymentTransaction.transactionID = args.OrderNo;
                paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
                paymentInstrument.paymentTransaction.custom.ckoGooglePayData = '';
            });

            return { authorized: true, error: false };
        }

        throw new Error('Authorization Error');
    } catch (e) {
        Transaction.wrap(function() {
            order.addNote('Payment Authorization Request:', e.message);
            paymentInstrument.paymentTransaction.transactionID = args.OrderNo;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoGooglePayData = '';
        });

        return { authorized: false, error: true, message: e.message };
    }
}

// Module exports
exports.Handle = Handle;
exports.Authorize = Authorize;
