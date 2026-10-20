'use strict';

var Money = require('dw/value/Money');
var Order = require('dw/order/Order');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentTransaction = require('dw/order/PaymentTransaction');

var Logger = require('dw/system/Logger');

var config = require('*/cartridge/scripts/checkoutcom/config');

var log = Logger.getLogger(config.LOG_CATEGORY);

/**
 * Keeps the payment transaction ledger the bm_checkoutcom console reads.
 *
 * The console lists each order's LAST payment instrument and offers capture,
 * void and refund on it, so every gateway action is recorded as a new
 * CHECKOUTCOM_FLOW instrument whose transaction carries the action:
 *
 *   authorization  TYPE_AUTH           opened until captured or voided
 *   capture        TYPE_CAPTURE        opened while refundable
 *   refund         TYPE_CREDIT         closed
 *   void           TYPE_AUTH_REVERSAL  closed
 *
 * The first instrument (created with the basket) holds the authorization.
 * All functions must run inside a Transaction.
 */

var TRANSACTION_TYPES = {
    Authorization: PaymentTransaction.TYPE_AUTH,
    Capture: PaymentTransaction.TYPE_CAPTURE,
    Refund: PaymentTransaction.TYPE_CREDIT,
    Void: PaymentTransaction.TYPE_AUTH_REVERSAL,
};

/**
 * @param {number} amount The amount in minor units
 * @param {string} currencyCode The currency
 * @returns {dw.value.Money} The amount as money
 */
function fromMinorUnits(amount, currencyCode) {
    var Currency = require('dw/util/Currency');
    var digits = Currency.getCurrency(currencyCode).getDefaultFractionDigits();

    return new Money(amount / Math.pow(10, digits), currencyCode);
}

/**
 * @param {dw.order.Order} order The order
 * @param {string} type One of the TRANSACTION_TYPES keys
 * @returns {dw.order.PaymentTransaction|null} The latest transaction of that type
 */
function findLatest(order, type) {
    var instruments = order.getPaymentInstruments(config.PAYMENT_METHOD_ID).toArray();

    for (var i = instruments.length - 1; i >= 0; i -= 1) {
        var transaction = instruments[i].getPaymentTransaction();

        if (transaction.custom.ckoTransactionType === type) {
            return transaction;
        }
    }

    return null;
}

/**
 * @param {dw.order.Order} order The order
 * @param {string} type One of the TRANSACTION_TYPES keys
 * @returns {number} The total amount of that type
 */
function totalOf(order, type) {
    return order.getPaymentInstruments(config.PAYMENT_METHOD_ID).toArray().reduce(function(sum, instrument) {
        var transaction = instrument.getPaymentTransaction();

        return transaction.custom.ckoTransactionType === type ? sum + transaction.getAmount().getValue() : sum;
    }, 0);
}

/**
 * @param {dw.order.Order} order The order
 * @param {string} actionId The Checkout.com action id (act_...)
 * @returns {boolean} True when that action is already in the ledger
 */
function hasAction(order, actionId) {
    if (!actionId) {
        return false;
    }

    return order.getPaymentInstruments(config.PAYMENT_METHOD_ID).toArray().some(function(instrument) {
        return instrument.getPaymentTransaction().custom.ckoActionId === actionId;
    });
}

/**
 * The capture recorded when the order was placed for an already captured
 * payment: it has no action id yet, because the payment response does not carry
 * the capture's action id. The payment_captured webhook completes it.
 * @param {dw.order.Order} order The order
 * @returns {dw.order.PaymentTransaction|null} The capture waiting for its action id
 */
function findCaptureWithoutAction(order) {
    var instruments = order.getPaymentInstruments(config.PAYMENT_METHOD_ID).toArray();

    for (var i = 0; i < instruments.length; i += 1) {
        var transaction = instruments[i].getPaymentTransaction();

        if (transaction.custom.ckoTransactionType === 'Capture' && !transaction.custom.ckoActionId) {
            return transaction;
        }
    }

    return null;
}

/**
 * Fill a transaction with a gateway action.
 * @param {dw.order.PaymentTransaction} transaction The transaction
 * @param {Object} action paymentId, actionId, type, amount (Money), opened
 */
function fill(transaction, action) {
    transaction.setTransactionID(action.paymentId);
    transaction.setPaymentProcessor(PaymentMgr.getPaymentMethod(config.PAYMENT_METHOD_ID).getPaymentProcessor());
    transaction.setType(TRANSACTION_TYPES[action.type]);
    transaction.setAmount(action.amount);
    transaction.custom.ckoActionId = action.actionId || null;
    transaction.custom.ckoTransactionType = action.type;
    transaction.custom.ckoTransactionOpened = action.opened;
}

/**
 * Append a gateway action as a new instrument.
 * @param {dw.order.Order} order The order
 * @param {Object} action paymentId, actionId, type, amount (Money), opened
 * @returns {dw.order.PaymentTransaction} The new transaction
 */
function append(order, action) {
    var instrument = order.createPaymentInstrument(config.PAYMENT_METHOD_ID, action.amount);
    var transaction = instrument.getPaymentTransaction();

    fill(transaction, action);

    return transaction;
}

/**
 * Derive the order payment status from the ledger.
 * @param {dw.order.Order} order The order
 */
function updatePaymentStatus(order) {
    var captured = totalOf(order, 'Capture') - totalOf(order, 'Refund');
    var total = order.getTotalGrossPrice().getValue();

    if (captured >= total && total > 0) {
        order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
    } else if (captured > 0) {
        order.setPaymentStatus(Order.PAYMENT_STATUS_PARTPAID);
    } else {
        order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
    }
}

module.exports = {
    fromMinorUnits: fromMinorUnits,
    findLatest: findLatest,
    updatePaymentStatus: updatePaymentStatus,

    /**
     * Record the authorization on the order's first Flow instrument, and the
     * capture as well when the payment was captured immediately.
     * @param {dw.order.Order} order The order
     * @param {Object} payment The verified gateway payment
     */
    recordPayment: function(order, payment) {
        var instruments = order.getPaymentInstruments(config.PAYMENT_METHOD_ID).toArray();
        var instrument = instruments[0];

        // Safety net: a duplicate basket instrument arrives in the order empty
        // (no transaction); it is not a payment and would only confuse the ledger
        instruments.slice(1).forEach(function(extra) {
            var transaction = extra.getPaymentTransaction();

            if (!transaction.getTransactionID() && !transaction.custom.ckoTransactionType) {
                order.removePaymentInstrument(extra);
                log.info('Order {0}: removed an empty duplicate payment instrument.', order.getOrderNo());
            }
        });

        var amount = fromMinorUnits(payment.amount, payment.currency);
        var captured = payment.status === 'Captured' || payment.status === 'Paid';
        // The payment_captured webhook can arrive before the order is completed
        // (the payment is bound to the order when it is submitted): its capture
        // is then already in the ledger and must not be recorded a second time
        var capturedByWebhook = findLatest(order, 'Capture') !== null;

        fill(instrument.getPaymentTransaction(), {
            paymentId: payment.id,
            actionId: payment.action_id || null,
            type: 'Authorization',
            amount: amount,
            opened: !captured && !capturedByWebhook,
        });

        if (captured && !capturedByWebhook) {
            append(order, { paymentId: payment.id, type: 'Capture', amount: amount, opened: true });
        }

        log.info('Order {0}: payment {1} recorded ({2}){3}.', order.getOrderNo(), payment.id, payment.status,
            capturedByWebhook ? ', capture already recorded by its webhook' : (captured ? ', capture recorded' : ''));

        order.custom.ckoPaymentId = payment.id;
        updatePaymentStatus(order);
    },

    /**
     * Record an action reported by a webhook.
     * @param {dw.order.Order} order The order
     * @param {string} type Capture, Refund or Void
     * @param {Object} data The webhook data ({ id, action_id, amount, currency })
     */
    recordAction: function(order, type, data) {
        // Idempotent: an action already in the ledger is never recorded twice
        if (hasAction(order, data.action_id)) {
            log.info('Order {0}: {1} {2} already recorded, ignored.', order.getOrderNo(), type, data.action_id);

            return;
        }

        var amount = data.amount !== undefined
            ? fromMinorUnits(data.amount, data.currency || order.getCurrencyCode())
            : order.getTotalGrossPrice();

        if (type === 'Capture') {
            var authorization = findLatest(order, 'Authorization');

            if (authorization) {
                authorization.custom.ckoTransactionOpened = false;
            }

            // The capture of an auto captured payment is recorded when the order is
            // placed; its webhook only adds the action id, otherwise the capture
            // would be counted twice (and the refundable amount doubled)
            var pending = findCaptureWithoutAction(order);

            if (pending) {
                pending.custom.ckoActionId = data.action_id || null;
                log.info('Order {0}: capture {1} matched to the capture recorded at completion.', order.getOrderNo(), data.action_id);
            } else {
                append(order, { paymentId: data.id, actionId: data.action_id, type: 'Capture', amount: amount, opened: true });
                log.info('Order {0}: capture {1} of {2} recorded.', order.getOrderNo(), data.action_id, amount);
            }
        } else if (type === 'Refund') {
            append(order, { paymentId: data.id, actionId: data.action_id, type: 'Refund', amount: amount, opened: false });
            log.info('Order {0}: refund {1} of {2} recorded.', order.getOrderNo(), data.action_id, amount);

            var capture = findLatest(order, 'Capture');

            if (capture) {
                capture.custom.ckoTransactionOpened = totalOf(order, 'Refund') < totalOf(order, 'Capture');
            }
        } else if (type === 'Void') {
            var voided = findLatest(order, 'Authorization');

            if (voided) {
                voided.custom.ckoTransactionOpened = false;
            }

            append(order, { paymentId: data.id, actionId: data.action_id, type: 'Void', amount: amount, opened: false });
            log.info('Order {0}: void {1} recorded.', order.getOrderNo(), data.action_id);
        }

        updatePaymentStatus(order);
    },
};
