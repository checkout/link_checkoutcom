'use strict';

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var klarnaHelper = require('*/cartridge/scripts/helpers/klarnaHelper');
var Transaction = require('dw/system/Transaction');
var constants = require('*/cartridge/config/constants');
var OrderMgr = require('dw/order/OrderMgr');

/**
 * Verifies that the payment data is valid.
 * @param {Object} basket The basket instance
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

        var paymentInstrument = basket.createPaymentInstrument(constants.CKO_KLARNA_PAYMENTINSTRUMENT, basket.getTotalGrossPrice());
        paymentInstrument.custom.ckoPaymentData = billingData.ckoKlarnaData.value;
    });

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: false,
    };
}

/**
 * Authorizes a payment.
 * @param {Object} orderNumber The order number
 * @param {Object} paymentInstrument The billing data
 * @param {string} paymentProcessor The processor id
 * @returns {Object} The payment result
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var order = OrderMgr.getOrder(orderNumber);

    // Payment request
    var result = klarnaHelper.handleRequest(
        paymentInstrument.custom.ckoPaymentData,
        paymentProcessor,
        orderNumber
    );

    // Handle errors
    if (result.error) {
        var errorTitle = 'Authorization Failed';
        Transaction.wrap(function() { // eslint-disable-next-line
            paymentInstrument.custom.ckoPaymentData = '';

            if (result.errorMessage) {
                order.addNote(errorTitle, result.errorMessage);
            }
        });
        serverErrors.push(
            ckoHelper.getPaymentFailureMessage()
        );
    }
    var transactionID = result.transactionID ? result.transactionID : '';

    Transaction.wrap(function() { // eslint-disable-next-line
        paymentInstrument.custom.ckoPaymentData = '';
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentInstrument.paymentTransaction.setTransactionID(transactionID);
    });

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: result.error,
        redirectUrl: result.redirectUrl,
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
