'use strict';

/* global session */

var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var tabbyHelper = require('*/cartridge/scripts/helpers/tabbyHelper');
var Transaction = require('dw/system/Transaction');
var constants = require('*/cartridge/config/constants');
var OrderMgr = require('dw/order/OrderMgr');

/**
 * Creates a Tabby payment instrument on the basket.
 * @param {dw.order.Basket} basket The basket instance
 * @returns {Object} The handle result
 */
function Handle(basket) {
    Transaction.wrap(function() {
        basket.removeAllPaymentInstruments();
        basket.createPaymentInstrument(constants.CKO_TABBY_PAYMENTINSTRUMENT, basket.getTotalGrossPrice());
    });

    return {
        fieldErrors: {},
        serverErrors: [],
        error: false,
    };
}

/**
 * Authorizes a Tabby payment using the stored payment_context_id.
 * @param {string} orderNumber The order number
 * @param {Object} paymentInstrument The payment instrument
 * @param {Object} paymentProcessor The payment processor
 * @returns {Object} The authorization result including redirectUrl
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var order = OrderMgr.getOrder(orderNumber);

    var paymentContextId = session.privacy.ckoTabbyContextId;
    var paymentType = session.privacy.ckoTabbyPaymentType || 'Installment';

    if (!paymentContextId) {
        Transaction.wrap(function() {
            order.addNote('Tabby Authorization Failed', 'Missing payment_context_id in session.');
        });
        return {
            fieldErrors: {},
            serverErrors: [ckoHelper.getPaymentFailureMessage()],
            error: true,
        };
    }

    // The context pays the basket as it was when Tabby was chosen: a basket
    // changed since (items, shipping, a coupon) is never charged that amount
    var contextAmount = session.privacy.ckoTabbyContextAmount;
    var contextCurrency = session.privacy.ckoTabbyContextCurrency;

    if (!contextAmount || Number(contextAmount) !== Number(ckoHelper.getAmount(order))
        || String(contextCurrency || '').toUpperCase() !== String(order.getCurrencyCode()).toUpperCase()) {
        Transaction.wrap(function() {
            order.addNote('Tabby Authorization Failed', 'The order total changed after Tabby was selected: ' + contextAmount + ' ' + contextCurrency + ' for an order of ' + ckoHelper.getAmount(order) + ' ' + order.getCurrencyCode() + '.');
        });
        session.privacy.ckoTabbyContextId = null;

        return {
            fieldErrors: {},
            serverErrors: [ckoHelper.getPaymentFailureMessage()],
            error: true,
        };
    }

    var result = tabbyHelper.handleRequest(paymentProcessor.ID, order, paymentContextId, paymentType);

    if (result.error) {
        Transaction.wrap(function() {
            if (result.errorMessage) {
                order.addNote('Tabby Authorization Failed', result.errorMessage);
            }
        });
        return {
            fieldErrors: {},
            serverErrors: [ckoHelper.getPaymentFailureMessage()],
            error: true,
        };
    }

    Transaction.wrap(function() {
        paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentInstrument.paymentTransaction.setTransactionID(result.transactionID || '');
    });

    session.privacy.ckoTabbyContextId = null;
    session.privacy.ckoTabbyPaymentType = null;
    session.privacy.ckoTabbyContextAmount = null;
    session.privacy.ckoTabbyContextCurrency = null;

    return {
        fieldErrors: {},
        serverErrors: [],
        error: false,
        redirectUrl: result.redirectUrl,
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
