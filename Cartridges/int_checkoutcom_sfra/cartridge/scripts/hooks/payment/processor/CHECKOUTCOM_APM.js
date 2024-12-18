'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');

/** CKO Util */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var apmHelper = require('*/cartridge/scripts/helpers/apmHelper');
var apmConfig = require('*/cartridge/config/ckoApmConfig');

/**
 * Verifies that the payment data is valid.
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @param {string} paymentMethodID - paymentmethodID
 * @param {Object} req the request object
 * @returns {Object} The form validation result
 */
function Handle(basket, paymentInformation, paymentMethodID, req) {
    var currentBasket = basket;
    var apmErrors = {};
    var serverErrors = [];
    var invalidPaymentMethod;

    // Validate payment instrument
    if (paymentMethodID === 'CHECKOUTCOM_APM') {
        var apmPaymentMethod = PaymentMgr.getPaymentMethod('CHECKOUTCOM_APM');

        if (!apmPaymentMethod) {
            // Invalid Payment Method
            invalidPaymentMethod = Resource.msg('error.payment.not.valid', 'checkout', null);

            return { fieldErrors: [], serverErrors: [invalidPaymentMethod], error: true };
        }
    }

    if (!paymentInformation.type.value) {
        // Invalid Payment Type
        invalidPaymentMethod = Resource.msg('error.payment.not.valid', 'checkout', null);

        return { fieldErrors: [], serverErrors: [invalidPaymentMethod], error: true };

        // Invalid Payment Type
        // apmErrors[paymentInformation.type.htmlName] =
        // Resource.msg('error.invalid.type.value', paymentInformation.type.htmlValue, null);

        // return { fieldErrors: [apmErrors], serverErrors: serverErrors, error: true };
    }

    Transaction.wrap(function() {
        currentBasket.removeAllPaymentInstruments();

        var paymentInstrument = currentBasket.createPaymentInstrument(
            'CHECKOUTCOM_APM', currentBasket.totalGrossPrice
        );

        paymentInstrument.custom.ckoPaymentData = JSON.stringify(paymentInformation);
    });

    return { fieldErrors: apmErrors, serverErrors: serverErrors, error: false };
}

/**
 * Authorizes a payment using an apm. Customizations may use other processors and custom
 *      logic to authorize apm payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var error = false;

    // Get the order
    var order = OrderMgr.getOrder(orderNumber);
    var formData = JSON.parse(paymentInstrument.custom.ckoPaymentData);

    // Prepare the arguments
    var args = {
        order: order,
        processorId: paymentProcessor.ID,
        paymentData: formData,
    };

    // Get the selected APM request data
    var func = formData.type.value + 'Authorization';
    var apmConfigData = apmConfig[func](args);

    try {
        var ckoPaymentRequest = apmHelper.handleRequest(apmConfigData, paymentProcessor.ID, orderNumber);

        // Handle errors
        if (ckoPaymentRequest.error) {
            error = true;
            serverErrors.push(
                ckoHelper.getPaymentFailureMessage()
            );
            Transaction.wrap(function() {
                paymentInstrument.paymentTransaction.setTransactionID(ckoPaymentRequest.transactionID);
                paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
                // eslint-disable-next-line
                paymentInstrument.custom.ckoPaymentData = '';
            });
        } else {
            Transaction.wrap(function() {
                paymentInstrument.paymentTransaction.setTransactionID(ckoPaymentRequest.transactionID);
                paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
                // eslint-disable-next-line
                paymentInstrument.custom.ckoPaymentData = '';
            });
        }
    } catch (e) {
        error = true;
        serverErrors.push(
            Resource.msg('error.technical', 'checkout', null)
        );
    }

    // eslint-disable-next-line
    return { fieldErrors: fieldErrors, serverErrors: serverErrors, error: error, redirectUrl: ckoPaymentRequest.redirectUrl };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
