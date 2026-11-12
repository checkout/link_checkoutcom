'use strict';

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');

/**
 * Verifies that the payment data is valid.
 * ACH has no additional form fields — bank details are collected client-side via Plaid Link.
 * @param {dw.order.Basket} basket Current user's basket
 * @param {Object} billingData The billing data
 * @param {string} processorId The processor id
 * @param {Object} req The HTTP request data
 * @returns {Object} The form validation result
 */
function Handle(basket, billingData, processorId, req) {
    var fieldErrors = {};
    var serverErrors = [];

    Transaction.wrap(function() {
        basket.removeAllPaymentInstruments();
        basket.createPaymentInstrument('CHECKOUTCOM_ACH', basket.getTotalGrossPrice());
    });

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: false,
    };
}

/**
 * Authorizes a payment using ACH Direct Debit.
 * The actual Checkout.com payment API call is deferred to the client side,
 * which first completes the Plaid Link bank authentication flow to obtain a
 * processor token, then calls CKOMain-ProcessAchPayment server-side.
 * @param {string} orderNumber The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor The payment processor
 * @returns {Object} The payment result with achPending flag
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var fieldErrors = {};
    var serverErrors = [];
    var order = OrderMgr.getOrder(orderNumber);

    Transaction.wrap(function() {
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        order.addNote('ACH Authorization', 'ACH payment initiated — awaiting Plaid bank authentication.');
    });

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: false,
        achPending: true,
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
