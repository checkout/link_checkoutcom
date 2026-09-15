'use strict';

/* Checkout Helpers */
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/**
 * Async payment methods whose outcome arrives by webhook, mapped to the helper
 * that reads/deletes their webhookNotification custom object entries.
 */
var METHOD_HELPERS = {
    CHECKOUTCOM_MBWAY: '*/cartridge/scripts/helpers/mbwayHelper',
    CHECKOUTCOM_BIZUM: '*/cartridge/scripts/helpers/bizumHelper',
    CHECKOUTCOM_ACH: '*/cartridge/scripts/helpers/achHelper',
};

/**
 * Transport-neutral status checks for asynchronous payments (MB WAY, Bizum, ACH).
 * Used by the SFRA polling controllers and by the SCAPI payment-status endpoint;
 * it returns a plain status and leaves redirect URLs to the caller.
 */
var paymentStatusHelper = {
    /**
     * Resolve the async payment method id from the order's payment instruments.
     * @param {dw.order.Order} order The order
     * @returns {string|null} The async payment method id, or null when the order has none
     */
    getAsyncPaymentMethod: function(order) {
        var instruments = order.getPaymentInstruments().toArray();
        for (var i = 0; i < instruments.length; i += 1) {
            if (Object.prototype.hasOwnProperty.call(METHOD_HELPERS, instruments[i].getPaymentMethod())) {
                return instruments[i].getPaymentMethod();
            }
        }
        return null;
    },

    /**
     * Check the async payment outcome recorded by the webhook for an order and,
     * on approval, place the order.
     * @param {dw.order.Order} order The order
     * @param {string} paymentMethodId The async payment method id
     * @returns {Object} Result with status ('pending'|'confirmed'|'failed'|'error'|'unsupported')
     */
    checkAsyncPaymentStatus: function(order, paymentMethodId) {
        var helperPath = METHOD_HELPERS[paymentMethodId];
        if (!helperPath) {
            return { status: 'unsupported' };
        }
        var methodHelper = require(helperPath);

        var notification = methodHelper.getWebhookNotification(order.orderNo);
        if (!notification) {
            return { status: 'pending' };
        }

        var eventType = notification.webhookType;

        if (eventType === 'payment_capture_pending' || eventType === 'payment_captured') {
            // Place the order if not already placed
            var placeOrderResult;
            try {
                placeOrderResult = COHelpers.placeOrder(order, { status: '' });
            } catch (e) {
                // Order may already be placed (race condition on second poll)
                placeOrderResult = { error: false };
            }

            if (placeOrderResult && placeOrderResult.error) {
                return { status: 'error' };
            }

            // Clean up the notification so subsequent polls don't re-place
            methodHelper.deleteWebhookNotification(order.orderNo);

            return { status: 'confirmed' };
        }

        if (eventType === 'payment_declined' || eventType === 'payment_expired') {
            // The webhook event handler already transitioned the order server-side
            methodHelper.deleteWebhookNotification(order.orderNo);

            return { status: 'failed' };
        }

        // payment_pending, bank_account_updated, or any other event — keep polling
        return { status: 'pending' };
    },
};

/**
 * Module exports
 */
module.exports = paymentStatusHelper;
