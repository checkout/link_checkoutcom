'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var PaymentMgr = require('dw/order/PaymentMgr');

/* Checkout.com Helper functions */
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');
var cardHelper = require('~/cartridge/scripts/helpers/cardHelper');
var transactionHelper = require('~/cartridge/scripts/helpers/transactionHelper');

/**
 * Gateway event functions for the Checkout.com cartridge integration.
 */
var eventsHelper = {
    /**
     * Adds the gateway webhook information to the newly created order.
     */
    addWebhookInfo: function (hook, paymentStatus, orderStatus) {
        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);
        if (order) {
            // Prepare the webhook info
            var details = '';
            details += ckoHelper._('cko.webhook.event', 'cko') + ': ' + hook.type + '\n';
            details += ckoHelper._('cko.transaction.id', 'cko') + ': ' + hook.data.action_id + '\n';
            details += ckoHelper._('cko.transaction.paymentId', 'cko') + ': ' + hook.data.id + '\n';
            details += ckoHelper._('cko.transaction.eventId', 'cko') + ': ' + hook.id + '\n';
            details += ckoHelper._('cko.response.code', 'cko') + ': ' + hook.data.response_code + '\n';

            // Process the transaction
            Transaction.wrap(function () {
                // Add the details to the order
                order.addNote(ckoHelper._('cko.webhook.info', 'cko'), details);
    
                // Update the payment status
                if (paymentStatus) {
                    order.setPaymentStatus(order[paymentStatus]);
                }

                // Update the order status
                if ((orderStatus) && (orderStatus.indexOf("CANCELLED") != -1 || orderStatus.indexOf("FAILED") != -1)) {
                    OrderMgr.failOrder(order);
                }
            });
        }
    },

    /**
     * Payment captured event.
     */
    paymentCaptured: function (hook) {
        // Get the  transaction amount
        var transactionAmount = transactionHelper.getHookTransactionAmount(hook);

        // Create the webhook info
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_PAID', null);

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id
        var paymentProcessorId = hook.data.metadata.payment_processor;

        // Create the captured transaction
        Transaction.wrap(function () {
            // Create the transaction
            var paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor();
            paymentInstrument.paymentTransaction.transactionID = hook.data.action_id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoPaymentId = hook.data.id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = true;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Capture';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_CAPTURE);

            // Update the parent transaction state
            var parentTransaction = transactionHelper.getParentTransaction(hook.data.id, 'Authorization');
            if (parentTransaction) {
                parentTransaction.custom.ckoTransactionOpened = false;
                paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = parentTransaction.transactionID;
            }
        });
    },

    /**
     * Payment authorized event.
     */
    paymentApproved: function (hook) {
        // Create the webhook info
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_NOTPAID', null);

        // Create the authorized transaction
        transactionHelper.createAuthorization(hook);

        // Save the card if needed
        cardHelper.updateSavedCard(hook);
    },

    /**
     * Card verified event.
     */
    cardVerified: function (hook) {
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_NOTPAID', null);
    },

    /**
     * Authorization failed event.
     */
    paymentDeclined: function (hook) {
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_NOTPAID', 'ORDER_STATUS_FAILED');
    },

    /**
     * Capture failed event.
     */
    paymentCaptureDeclined: function (hook) {
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_NOTPAID', 'ORDER_STATUS_FAILED');
    },

    /**
     * Payment refunded event.
     */
    paymentRefunded: function (hook) {
        // Get the  transaction amount
        var transactionAmount = transactionHelper.getHookTransactionAmount(hook);

        // Create the webhook info
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_PAID', 'ORDER_STATUS_CANCELLED');

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id
        var paymentProcessorId = hook.data.metadata.payment_processor;
 
        // Create the refunded transaction
        Transaction.wrap(function () {
            var paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor();
            paymentInstrument.paymentTransaction.transactionID = hook.data.action_id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoPaymentId = hook.data.id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = false;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Refund';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_CREDIT);

            // Update the parent transaction state
            var parentTransaction = transactionHelper.getParentTransaction(hook.data.id, 'Capture');
            if (parentTransaction) {
                parentTransaction.custom.ckoTransactionOpened = !transactionHelper.shouldCloseRefund(transactionAmount, order);
                paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = parentTransaction.transactionID;
            }
        });
    },

    /**
     * Payment voided event.
     */
    paymentVoided: function (hook) {
        // Get the  transaction amount
        var transactionAmount = transactionHelper.getHookTransactionAmount(hook);

        // Create the webhook info
        this.addWebhookInfo(hook, 'PAYMENT_STATUS_NOTPAID', 'ORDER_STATUS_CANCELLED');

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id
        var paymentProcessorId = hook.data.metadata.payment_processor;
               
        // Create the voided transaction
        Transaction.wrap(function () {
            // Create the transaction
            var paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor();
            paymentInstrument.paymentTransaction.transactionID = hook.data.action_id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoPaymentId = hook.data.id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = false;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Void';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH_REVERSAL);

            // Update the parent transaction state
            var parentTransaction = transactionHelper.getParentTransaction(hook.data.id, 'Authorization');
            if (parentTransaction) {
                parentTransaction.custom.ckoTransactionOpened = false;
                paymentInstrument.paymentTransaction.custom.ckoParentTransactionId = parentTransaction.transactionID;
            }    
        });
    },

    /**
     * Refund failed event.
     */
    paymentRefundDeclined: function (hook) {
        this.addWebhookInfo(hook, null, null);
    },

    /**
     * Charge void failed event.
     */
    paymentVoidDeclined: function (hook) {
        this.addWebhookInfo(hook, null, null);
    }
};

/*
 * Module exports
 */

module.exports = eventsHelper;