'use strict';

/* API Includes */
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');
var Money = require('dw/value/Money');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Transaction helper module.
 */
var transactionHelper = {
    /**
     * Get webhook transaction amount
     * @param {Object} hook The gateway webhook data
     * @returns {Object} The formatted amount object
     */
    getHookTransactionAmount: function(hook) {
        var divider = ckoHelper.getCkoFormatedValue(hook.data.currency);
        var amount = parseInt(hook.data.amount) / divider;
        return new Money(
            amount,
            hook.data.currency
        );
    },

    /**
     * Create an authorization transaction
     * @param {Object} hook The gateway webhook data
     */
    createAuthorization: function(hook) {
        // Get the transaction amount
        var transactionAmount = this.getHookTransactionAmount(hook);

        // Load the order
        var order = OrderMgr.getOrder(hook.data.reference);

        // Get the payment processor id
        var paymentProcessorId = hook.data.metadata.payment_processor;
        Transaction.wrap(function() {
            // Create the payment instrument and processor
            var paymentInstrument = order.getPaymentInstruments();

            if (paymentInstrument[0] && (paymentInstrument[0].paymentTransaction.transactionID === hook.data.id || paymentInstrument[0].paymentTransaction.transactionID === '')) {
                paymentInstrument = paymentInstrument[0];
            } else {
                paymentInstrument = order.createPaymentInstrument(paymentProcessorId, transactionAmount);
            }

            var paymentMethod = paymentInstrument.paymentMethod === 'CHECKOUTCOM_CARD' ? 'CREDIT_CARD' : paymentInstrument.paymentMethod;
            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethod).getPaymentProcessor();

            // Create the authorization transaction
            paymentInstrument.paymentTransaction.setAmount(transactionAmount);
            paymentInstrument.paymentTransaction.transactionID = hook.data.id;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
            paymentInstrument.paymentTransaction.custom.ckoActionId = hook.data.action_id;
            paymentInstrument.paymentTransaction.custom.ckoTransactionOpened = true;
            paymentInstrument.paymentTransaction.custom.ckoTransactionType = 'Authorization';
            paymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
        });
    },

    /**
     * Get a parent transaction from a payment id
     * @param {Object} hook The gateway webhook data
     * @param {string} transactionType The transaction type
     * @returns {Object} The parent transaction instance
     */
    getParentTransaction: function(hook, transactionType) {
        // Prepare the payload
        var mode = ckoHelper.getValue(constants.CKO_MODE);
        var ckoChargeData = {
            chargeId: hook.data.id,
        };

        // Get the payment actions
        var paymentActions = ckoHelper.gatewayClientRequest(
            'cko.payment.actions.' + mode + '.service',
            ckoChargeData,
            'GET'
        );

        // Convert the list to array
        if (paymentActions) {
            var paymentActionsArray = paymentActions.toArray();

            // Return the requested transaction
            for (var i = 0; i < paymentActionsArray.length; i++) {
                if (paymentActionsArray[i].type === transactionType) {
                    return this.loadTransaction(paymentActionsArray[i].id, hook.data.reference);
                }
            }
        }

        return null;
    },

    /**
     * Load a transaction by Id.
     * @param {string} transactionId The transaction id
     * @param {string} orderNo The order number
     * @returns {Object} The transactionn instance
     */
    loadTransaction: function(transactionId, orderNo) {
        // Query the orders
        var result = ckoHelper.getOrders(orderNo);

        // Loop through the results
        for (var i = 0; i < result.length; i++) {
            // Get the payment instruments
            var paymentInstruments = result[i].getPaymentInstruments().toArray();

            // Loop through the payment instruments
            for (var j = 0; j < paymentInstruments.length; j++) {
                // Get the payment transaction
                var paymentTransaction = paymentInstruments[j].getPaymentTransaction();

                // Prepare the filter condition
                var isIdMatch = paymentTransaction.custom.ckoActionId === transactionId;

                // Add the payment transaction to the output
                if (isIdMatch) {
                    return paymentTransaction;
                }
            }
        }

        return null;
    },

    /**
     * Check if a capture transaction can allow refunds.
     * @param {Object} order The order instance
     * @returns {boolean} Should the refund action be closed
     */
    shouldCloseRefund: function(order) {
        // Prepare the totals
        var totalRefunded = 0;
        var totalCaptured = 0;

        // Get the payment instruments
        var paymentInstruments = order.getPaymentInstruments().toArray();

        // Loop through the payment instruments
        for (var i = 0; i < paymentInstruments.length; i++) {
            // Get the payment transaction
            var paymentTransaction = paymentInstruments[i].getPaymentTransaction();

            // Calculate the total refunds
            if (paymentTransaction.type.toString() === PaymentTransaction.TYPE_CREDIT) {
                totalRefunded += parseFloat(paymentTransaction.amount.value);
            }

            // Calculate the total captures
            if (paymentTransaction.type.toString() === PaymentTransaction.TYPE_CAPTURE) {
                totalCaptured += parseFloat(paymentTransaction.amount.value);
            }
        }

        // Check if a refund is possible
        return totalRefunded >= totalCaptured;
    },
};

/*
 * Module exports
 */
module.exports = transactionHelper;
