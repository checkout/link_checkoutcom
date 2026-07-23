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
    try {
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
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').error('CHECKOUTCOM_KLARNA Handle failed: {0}', e.message);
        return {
            fieldErrors: {},
            serverErrors: [ckoHelper.getPaymentFailureMessage()],
            error: true,
        };
    }
}

/**
 * Authorizes a payment.
 * @param {Object} orderNumber The order number
 * @param {Object} paymentInstrument The billing data
 * @param {string} paymentProcessor The processor id
 * @returns {Object} The payment result
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    try {
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
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').error('CHECKOUTCOM_KLARNA Authorize failed: {0}', e.message);
        return {
            fieldErrors: {},
            serverErrors: [ckoHelper.getPaymentFailureMessage()],
            error: true,
        };
    }
}

exports.Handle = Handle;
exports.Authorize = Authorize;

// Alias export required by the Commerce Apps registry scan: the hook name's
// last segment (hooks.json) must exist as an export. SFCC resolves the hook
// functions above by name through HookMgr; this alias is not invoked.
exports.checkoutcom_klarna = { Handle: Handle, Authorize: Authorize };
