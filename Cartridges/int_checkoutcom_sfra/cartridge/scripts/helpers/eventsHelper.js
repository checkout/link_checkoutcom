'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var PaymentMgr = require('dw/order/PaymentMgr');

/* Checkout.com Helper functions */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var savedCardHelper = require('*/cartridge/scripts/helpers/savedCardHelper');
var transactionHelper = require('*/cartridge/scripts/helpers/transactionHelper');

var CONSTANTS = {
    PAYMENT_STATUS_PAID: 'PAYMENT_STATUS_PAID',
    PAYMENT_STATUS_NOTPAID: 'PAYMENT_STATUS_NOTPAID',
    ORDER_STATUS_CANCELLED: 'ORDER_STATUS_CANCELLED',
    ORDER_STATUS_FAILED: 'ORDER_STATUS_FAILED',
};

/**
 * Sets the payment status of an order based on the amount paid
 * The total amount paid is calculated by checking each transaction and adding/subtracting
 * based on the type of the transaction.
 * @param {dw.order.Order} order - The order the customer placed
 */
function setPaymentStatus(order) {
    var paymentInstruments = order.getPaymentInstruments().toArray();
    var amountPaid = 0;
    var orderTotal = order.getTotalGrossPrice().getValue();

    for (var i = 0; i < paymentInstruments.length; i++) {
        var paymentTransaction = paymentInstruments[i].paymentTransaction;
        if (paymentTransaction.type.value === 'CAPTURE') {
            amountPaid += paymentTransaction.amount.value;
            if (amountPaid > orderTotal) {
                amountPaid = orderTotal;
            }
        } else if (paymentTransaction.type.value === 'CREDIT') {
            amountPaid -= paymentTransaction.amount.value;
        }
    }

    if (amountPaid === orderTotal) {
        order.setPaymentStatus(order.PAYMENT_STATUS_PAID);
    } else if (amountPaid >= 0.01) {
        order.setPaymentStatus(order.PAYMENT_STATUS_PARTPAID);
    } else {
        order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
    }
}

/**
 * Gateway event functions for the Checkout.com cartridge integration.
 */
var eventsHelper = {
    /**
     * Adds the gateway webhook information to the newly created order.
     * @param {Object} hook The gateway webhook data
     * @param {string} paymentStatus The payment status
     * @param {string} orderStatus The order status
     * @param {boolean} onlyIfNotPaid When true, skips status/order updates if GET() already set the order to PAID
     */
    addWebhookInfo: function(hook, paymentStatus, orderStatus, onlyIfNotPaid) {
        // Build details string outside the transaction (no DB writes here)
        var details = '';
        details += ckoHelper._('cko.webhook.event', 'cko') + ': ' + hook.type + '\n';
        details += ckoHelper._('cko.action.id', 'cko') + ': ' + hook.data.action_id + '\n';
        details += ckoHelper._('cko.transaction.paymentId', 'cko') + ': ' + hook.data.id + '\n';
        details += ckoHelper._('cko.transaction.eventId', 'cko') + ': ' + hook.id + '\n';
        details += ckoHelper._('cko.response.code', 'cko') + ': ' + hook.data.response_code + '\n';

        var flagDetails = (hook.data.risk && hook.data.risk.flagged)
            ? 'Subject: Payment authorized but flagged\nText: ' + hook.data.response_summary
            : null;

        // Load the order INSIDE the transaction so we always read the latest OCA version.
        // Loading it outside and then writing inside causes ORMOptimisticLockingException
        // when two webhooks for the same order arrive concurrently.
        Transaction.wrap(function() {
            var order = OrderMgr.getOrder(hook.data.reference);
            if (!order) { return; }

            order.addNote(ckoHelper._('cko.webhook.info', 'cko'), details);

            // If onlyIfNotPaid, skip status/order updates if GET() already confirmed the payment as PAID
            var alreadyPaid = onlyIfNotPaid && order.paymentStatus === Order.PAYMENT_STATUS_PAID;

            if (paymentStatus && !alreadyPaid) {
                order.setPaymentStatus(order[paymentStatus]);
            }

            if (flagDetails) {
                order.addNote(ckoHelper._('cko.webhook.info', 'cko'), flagDetails);
                order.setConfirmationStatus(order.CONFIRMATION_STATUS_NOTCONFIRMED);
            }

            if (orderStatus && !alreadyPaid && (orderStatus.indexOf('CANCELLED') !== -1 || orderStatus.indexOf('FAILED') !== -1)) {
                OrderMgr.failOrder(order, true);
            }
        });
    },

    /**
     * Payment captured event.
     * @param {Object} hook The gateway webhook data
     */
    paymentCaptured: function(hook) {
        // Get the  transaction amount
        var transactionAmount = transactionHelper.getHookTransactionAmount(hook);

        // Create the webhook info
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_PAID, null);

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id — fall back to order's payment instrument for methods without metadata (e.g. Alma)
        var paymentProcessorId = (hook.data.metadata && hook.data.metadata.payment_processor)
            ? hook.data.metadata.payment_processor
            : order.getPaymentInstruments().toArray()[0].getPaymentMethod();

        // Create the captured transaction
        Transaction.wrap(function() {
            // Create the transaction
            var paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            var paymentMethod = paymentInstrument.paymentMethod === 'CHECKOUTCOM_CARD' ? 'CREDIT_CARD' : paymentInstrument.paymentMethod;
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethod).getPaymentProcessor();
            paymentInstrument.paymentTransaction.transactionID = hook.data.id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoActionId = hook.data.action_id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = true;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Capture';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_CAPTURE);

            setPaymentStatus(order);

            order.setConfirmationStatus(order.CONFIRMATION_STATUS_CONFIRMED);

            // Update the parent transaction state
            var parentTransaction = transactionHelper.getParentTransaction(hook, 'Authorization');
            if (parentTransaction) {
                parentTransaction.custom.ckoTransactionOpened = false;
                paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = parentTransaction.transactionID;
            }
        });
    },

    /**
     * Payment authorized event.
     * @param {Object} hook The gateway webhook data
     */
    paymentApproved: function(hook) {
        // Create the webhook info
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, null);

        // Create the authorized transaction
        transactionHelper.createAuthorization(hook);

        // Save the card if needed
        savedCardHelper.updateSavedCard(hook);
    },

    /**
     * Card verified event.
     * @param {Object} hook The gateway webhook data
     */
    cardVerified: function(hook) {
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, null);
    },

    /**
     * Authorization failed event.
     * @param {Object} hook The gateway webhook data
     */
    paymentDeclined: function(hook) {
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, CONSTANTS.ORDER_STATUS_FAILED, true);

        var declinedOrder = OrderMgr.getOrder(hook.data.reference);
        if (declinedOrder && declinedOrder.paymentStatus !== Order.PAYMENT_STATUS_PAID) {
            var declinedOrderRef = declinedOrder;
            Transaction.wrap(function() {
                declinedOrderRef.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
            });
        }

        // Delete the card if needed
        savedCardHelper.updateSavedCard(hook);
    },

    /**
     * Capture failed event.
     * @param {Object} hook The gateway webhook data
     */
    paymentCaptureDeclined: function(hook) {
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, CONSTANTS.ORDER_STATUS_FAILED);
    },

    /**
     * Payment refunded event.
     * @param {Object} hook The gateway webhook data
     */
    paymentRefunded: function(hook) {
        // Get the  transaction amount
        var transactionAmount = transactionHelper.getHookTransactionAmount(hook);

        // Create the webhook info
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_PAID, CONSTANTS.ORDER_STATUS_CANCELLED);

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id
        var paymentProcessorId = order.getPaymentInstrument().getPaymentMethod();

        // Create the refunded transaction
        Transaction.wrap(function() {
            var paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            var paymentMethod = paymentInstrument.paymentMethod === 'CHECKOUTCOM_CARD' ? 'CREDIT_CARD' : paymentInstrument.paymentMethod;
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethod).getPaymentProcessor();
            paymentInstrument.paymentTransaction.transactionID = hook.data.id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoActionId = hook.data.action_id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = false;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Refund';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_CREDIT);

            setPaymentStatus(order);

            // Update the parent transaction state
            var parentTransaction = transactionHelper.getParentTransaction(hook, 'Capture');
            if (parentTransaction) {
                parentTransaction.custom.ckoTransactionOpened = !transactionHelper.shouldCloseRefund(order);
                paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = parentTransaction.transactionID;
            }
        });
    },

    /**
     * Payment voided event.
     * @param {Object} hook The gateway webhook data
     */
    paymentVoided: function(hook) {
        // Get the  transaction amount
        var transactionAmount = transactionHelper.getHookTransactionAmount(hook);

        // Create the webhook info
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, CONSTANTS.ORDER_STATUS_CANCELLED);

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id
        var paymentProcessorId = order.getPaymentInstrument().getPaymentMethod();

        // Create the voided transaction
        Transaction.wrap(function() {
            // Create the transaction
            var paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            var paymentMethod = paymentInstrument.paymentMethod === 'CHECKOUTCOM_CARD' ? 'CREDIT_CARD' : paymentInstrument.paymentMethod;
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethod).getPaymentProcessor();
            paymentInstrument.paymentTransaction.transactionID = hook.data.id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoActionId = hook.data.action_id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = false;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Void';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH_REVERSAL);

            setPaymentStatus(order);

            // Update the parent transaction state
            var parentTransaction = transactionHelper.getParentTransaction(hook, 'Authorization');
            if (parentTransaction) {
                parentTransaction.custom.ckoTransactionOpened = false;
                paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = parentTransaction.transactionID;
            }
        });
    },

    /**
     * Void Payment
     * @param {Object} hook The gateway webhook data
     */
    paymentCanceled: function(hook) {
        // Utilize payment void method
        this.paymentVoided(hook);
    },

    /**
     * Payment pending event.
     * @param {Object} hook The gateway webhook data
     */
    paymentPending: function(hook) {
        this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, '', true);
    },

    /**
     * Payment expired event.
     * For ACH (AC11): retain Not Paid status, do NOT fail the order — no storefront action.
     * For all other methods: mark the order as failed.
     * @param {Object} hook The gateway webhook data
     */
    paymentExpired: function(hook) {
        var isAch = hook.data && hook.data.metadata &&
                    hook.data.metadata.payment_processor === 'CHECKOUTCOM_ACH';

        if (isAch) {
            // AC11: payment_expired for ACH — log the event, retain Not Paid, no order status change
            this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, '');
        } else {
            this.addWebhookInfo(hook, CONSTANTS.PAYMENT_STATUS_NOTPAID, CONSTANTS.ORDER_STATUS_FAILED, true);

            var expiredOrder = OrderMgr.getOrder(hook.data.reference);
            if (expiredOrder && expiredOrder.paymentStatus !== Order.PAYMENT_STATUS_PAID) {
                var expiredOrderRef = expiredOrder;
                Transaction.wrap(function() {
                    expiredOrderRef.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
                });
            }
        }
    },

    /**
     * Refund failed event.
     * @param {Object} hook The gateway webhook data
     */
    paymentRefundDeclined: function(hook) {
        this.addWebhookInfo(hook, null, null);
    },

    /**
     * Charge void failed event.
     * @param {Object} hook The gateway webhook data
     */
    paymentVoidDeclined: function(hook) {
        this.addWebhookInfo(hook, null, null);
    },

    /**
     * Payment capture pending event.
     * For MB WAY: shopper approved in banking app — confirm the order and mark payment as not yet settled.
     * For all other methods: generic webhook info logging.
     * @param {Object} hook The gateway webhook data
     */
    paymentCapturePending: function(hook) {
        this.addWebhookInfo(hook, null, null); 
    },

    /**
     * Payment refund pending event.
     * @param {Object} hook The gateway webhook data
     */
    paymentRefundPending: function(hook) {
        this.addWebhookInfo(hook, null, null);
    },

    /**
     * Bank account updated event (ACH — AC18).
     * Logs the event to Order Notes and deletes the stored Plaid processor token
     * from the customer Profile so it cannot be reused after the bank account changes.
     * @param {Object} hook The gateway webhook data
     */
    bankAccountUpdated: function(hook) {
        this.addWebhookInfo(hook, null, null);

        var order = OrderMgr.getOrder(hook.data.reference);
        if (order && order.getCustomer() && order.getCustomer().isRegistered()) {
            var achHelper = require('*/cartridge/scripts/helpers/achHelper');
            achHelper.deleteProcessorToken(order.getCustomer());
        }
    },
};

/**
 * Module exports
 */
module.exports = eventsHelper;
