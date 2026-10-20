'use strict';

/* API Includes */
var Logger = require('dw/system/Logger');
var PaymentMgr = require('dw/order/PaymentMgr');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');

/* CKO Util */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var flowHelper = require('*/cartridge/scripts/helpers/flowHelper');

/* Configuration */
var constants = require('*/cartridge/config/constants');
var flowConfig = require('*/cartridge/config/ckoFlowConfig');

/**
 * Checkout.com Flow payment processor.
 *
 * Flow collects the payment details itself, inside the Checkout Web Components
 * bundle, so there is nothing to validate in Handle(). Authorize() creates the
 * order side of the payment and hands the shopper to CKOFlow-Show, which is where
 * the payment session is created and the component is rendered. The order is
 * placed once the gateway confirms the payment, in CKOFlow-Complete or
 * CKOFlow-HandleReturn.
 */

/**
 * Verifies that Flow may be used and creates the payment instrument.
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation The payment information
 * @param {string} paymentMethodID The payment method id
 * @param {Object} req The request object
 * @returns {Object} The handle result
 */
function Handle(basket, paymentInformation, paymentMethodID, req) { // eslint-disable-line no-unused-vars
    var currentBasket = basket;
    var serverErrors = [];

    // The generic "payment not valid" message is deliberately vague for shoppers,
    // so the actual reason is logged to make a misconfiguration diagnosable.
    var reject = function(reason) {
        Logger.getLogger('checkoutcom').error('Flow Handle() rejected the payment: {0}', reason);

        return {
            fieldErrors: [],
            serverErrors: [Resource.msg('error.payment.not.valid', 'checkout', null)],
            error: true,
        };
    };

    if (!flowHelper.isEnabled()) {
        return reject('the ckoFlowEnabled site preference is not true for site "'
            + Site.getCurrent().getID() + '" (value: ' + ckoHelper.getValue(flowConfig.CKO_FLOW_ENABLED) + ').');
    }

    if (!PaymentMgr.getPaymentMethod(flowConfig.PAYMENT_METHOD_ID)) {
        return reject('the ' + flowConfig.PAYMENT_METHOD_ID
            + ' payment method does not exist. Import the payment-methods metadata.');
    }

    if (paymentMethodID !== flowConfig.PAYMENT_METHOD_ID) {
        return reject('it was called for payment method "' + paymentMethodID
            + '" instead of ' + flowConfig.PAYMENT_METHOD_ID + '.');
    }

    if (!flowHelper.getPublicKey()) {
        return reject('no public key is configured for ' + ckoHelper.getValue(constants.CKO_MODE)
            + ' mode. Set the ABC/NAS public key site preference.');
    }

    Transaction.wrap(function() {
        currentBasket.removeAllPaymentInstruments();

        currentBasket.createPaymentInstrument(flowConfig.PAYMENT_METHOD_ID, currentBasket.totalGrossPrice);
    });

    return { fieldErrors: {}, serverErrors: serverErrors, error: false };
}

/**
 * Prepares the Flow payment and redirects the shopper to the Flow page.
 * No gateway call is made here: the payment session is created by CKOFlow-Show so
 * that it is always built from the order as it is at render time.
 * @param {number} orderNumber The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor The payment processor
 * @returns {Object} The authorization result
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];

    try {
        Transaction.wrap(function() {
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        });

        // Only this order number may be settled by the Flow routes in this session
        // eslint-disable-next-line no-undef
        session.privacy.ckoFlowOrderNo = orderNumber;

        var result = {
            fieldErrors: {},
            serverErrors: serverErrors,
            error: false,
            redirectUrl: URLUtils.https('CKOFlow-Show', 'ref', orderNumber).toString(),
        };

        // In inline display mode the checkout page mounts Flow in the place order
        // step instead of following redirectUrl, which stays the fallback for when
        // the inline mount is not possible. In page mode the shopper is redirected.
        if (flowHelper.isInlineDisplay()) {
            result.flowSessionUrl = URLUtils.https('CKOFlow-Session', 'ref', orderNumber).toString();
        }

        return result;
    } catch (e) {
        serverErrors.push(ckoHelper.getPaymentFailureMessage());

        return { fieldErrors: {}, serverErrors: serverErrors, error: true };
    }
}

exports.Handle = Handle;
exports.Authorize = Authorize;
