'use strict';

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var mbwayPaymentHelper = require('*/cartridge/scripts/helpers/mbwayPaymentHelper');
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');

/**
 * Verifies that the payment data is valid.
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
        basket.createPaymentInstrument('CHECKOUTCOM_MBWAY', basket.getTotalGrossPrice());
    });

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: false,
    };
}

/**
 * Authorizes a payment using MB WAY.
 * @param {string} orderNumber The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor The payment processor
 * @returns {Object} The payment result
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var order = OrderMgr.getOrder(orderNumber);

    var result = mbwayPaymentHelper.handleRequest(
        paymentProcessor.ID,
        orderNumber
    );

    if (result.error) {
        Transaction.wrap(function() {
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
            paymentInstrument.paymentTransaction.setTransactionID(result.transactionID);
            order.addNote('MB WAY Authorization Failed', ckoHelper.getPaymentFailureMessage());
        });
        serverErrors.push(ckoHelper.getPaymentFailureMessage());
    } else {
        Transaction.wrap(function() {
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
            paymentInstrument.paymentTransaction.setTransactionID(result.transactionID);
        });
    }

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: result.error,
        mbwayPending: result.mbwayPending,
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
