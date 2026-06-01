'use strict';

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var almaHelper = require('*/cartridge/scripts/helpers/almaHelper');
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
        basket.createPaymentInstrument(constants.CKO_ALMA_PAYMENTINSTRUMENT, basket.getTotalGrossPrice());
    });

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: false,
    };
}

/**
 * Authorizes a payment via Alma redirect.
 * @param {Object} orderNumber The order number
 * @param {Object} paymentInstrument The payment instrument
 * @param {string} paymentProcessor The processor id
 * @returns {Object} The payment result including a redirectUrl
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var order = OrderMgr.getOrder(orderNumber);

    var result = almaHelper.handleRequest(paymentProcessor, order);

    if (result.error) {
        var errorTitle = 'Alma Authorization Failed';
        Transaction.wrap(function() {
            if (result.errorMessage) {
                order.addNote(errorTitle, result.errorMessage);
            }
        });
        serverErrors.push(ckoHelper.getPaymentFailureMessage());
    }

    var transactionID = result.transactionID ? result.transactionID : '';

    Transaction.wrap(function() {
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
