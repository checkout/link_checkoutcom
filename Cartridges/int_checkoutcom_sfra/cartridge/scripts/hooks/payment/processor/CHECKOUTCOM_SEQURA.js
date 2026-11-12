'use strict';

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var sequraHelper = require('*/cartridge/scripts/helpers/sequraHelper');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var OrderMgr = require('dw/order/OrderMgr');
var constants = require('*/cartridge/config/constants');

/**
 * Verifies that the payment data is valid and creates the Sequra payment instrument.
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
        basket.createPaymentInstrument(constants.CKO_SEQURA_PAYMENTINSTRUMENT, basket.getTotalGrossPrice());
    });

    // Product type is stored in session by the form processor during SubmitPayment

    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: false,
    };
}

/**
 * Authorizes a payment via Sequra redirect.
 * Sends the payment request to the Checkout.com Payments API and returns
 * the Sequra redirect URL for the shopper to complete payment.
 * @param {string} orderNumber The order number
 * @param {dw.order.PaymentInstrument} paymentInstrument The payment instrument
 * @param {dw.order.PaymentProcessor} paymentProcessor The payment processor
 * @returns {Object} The payment result including a redirectUrl
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var order = OrderMgr.getOrder(orderNumber);

    var selectedProduct = session.privacy.ckoSequraProductType || 'invoice';
    session.privacy.ckoSequraProductType = null;

    var result = sequraHelper.handleRequest(paymentProcessor.ID, order, selectedProduct);

    if (result.error) {
        Transaction.wrap(function() {
            if (result.errorMessage) {
                order.addNote('Sequra Authorization Failed', result.errorMessage);
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
