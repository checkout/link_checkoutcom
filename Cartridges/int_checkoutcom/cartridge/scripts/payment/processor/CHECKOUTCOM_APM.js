'use strict';

// Site controller
var Site = require('dw/system/Site');

// API Includes
var Transaction = require('dw/system/Transaction');
var Cart = require('*/cartridge/scripts/models/CartModel');
var app = require('*/cartridge/scripts/app');

// Utility
var apmHelper = require('~/cartridge/scripts/helpers/apmHelper');

// APM Configuration
var apmConfig = require('~/cartridge/scripts/config/ckoApmConfig');

/**
 * Verifies that the payment data is valid.
 * @param {Object} args The method arguments
 * @returns {Object} The form validation result
 */
function Handle(args) {
    // Proceed with transaction
    var cart = Cart.get(args.Basket);
    var paymentMethod = args.PaymentMethodID;
    var apmForm = paymentMethod.toLowerCase() + 'Form';
    
    // Get apms form
    var paymentForm = app.getForm(apmForm).object;
    args.paymentInformation = {};

    // If this apm have a form
    if (paymentForm) {
        args.paymentInformation = {};
        Object.keys(paymentForm).forEach(function(key) {
            var type = typeof paymentForm[key];
            if (type === 'object' && paymentForm[key] != null) {
                args.paymentInformation[key] = {
                    value: paymentForm[key].htmlValue,
                    htmlName: paymentForm[key].htmlName,
                };
            }
        });

    }

    // Validate form value
    if (args.paymentInformation) {
        var error = false;
        Object.keys(args.paymentInformation).forEach(function(key) {
            var currentElement = args.paymentInformation[key];
            if (currentElement.value === '') {
                error = true;
            }
        });

        if (error) {
            return { error: true }
        }
    }

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
    var paymentInstrument = args.PaymentInstrument;
    var paymentMethod = paymentInstrument.getPaymentMethod();
    var PaymentMgr = require('dw/order/PaymentMgr');
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethod).getPaymentProcessor();

    var func = paymentMethod.toLowerCase() + 'PayAuthorization';
    // Get the required apm pay config object
    var payObject = apmConfig[func](args);

    try {
        var paymentAuth = apmHelper.apmAuthorization(payObject, args);

        Transaction.wrap(function () {
            order.addNote('Payment Authorization Request:', 'Payment Authorization successful');
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
        });

        if (paymentAuth) { 

            return {authorized: true, error: false};
        } else {
            throw new Error({mssage: 'Authorization Error'});
        }
    } catch(e) {
        Transaction.wrap(function () {
            order.addNote('Payment Authorization Request:', e.message);
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
        });

        return {authorized: false, error: true, message: e.message };
    }
}

// Local methods
exports.Handle = Handle;
exports.Authorize = Authorize;
