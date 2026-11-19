'use strict';

/* API Includes */
var URLUtils = require('dw/web/URLUtils');

/**
 * The payment errors the checkout page shows, by the code sent in its
 * paymentError parameter. The page shows the localized message of a code
 * (checkout/billing/billing.isml), never text from the URL.
 */
var PAYMENT_ERRORS = {
    INVALID: 'invalid',
    UNVERIFIED: 'unverified',
    RELEASED: 'released',
};

/**
 * Payment helper module.
 */
var paymentHelper = {
    PAYMENT_ERRORS: PAYMENT_ERRORS,

    /**
     * The checkout payment step, showing a payment error.
     * @param {string} [code] A PAYMENT_ERRORS code; none shows no message
     * @param {boolean} [secure] An absolute https URL
     * @returns {dw.web.URL} The URL
     */
    getPaymentErrorUrl: function(code, secure) {
        if (secure) {
            return code
                ? URLUtils.https('Checkout-Begin', 'stage', 'payment', 'paymentError', code)
                : URLUtils.https('Checkout-Begin', 'stage', 'payment');
        }

        return code
            ? URLUtils.url('Checkout-Begin', 'stage', 'payment', 'paymentError', code)
            : URLUtils.url('Checkout-Begin', 'stage', 'payment');
    },

    /**
     * Send the shopper back to checkout after a payment that arrived for an
     * order already closed, and was released.
     * @param {Object} res The response
     */
    getReleasedPageRedirect: function(res) {
        res.redirect(this.getPaymentErrorUrl(PAYMENT_ERRORS.RELEASED));
    },

    /**
     * Get the confirmation page redirection.
     * @param {Object} res The HTTP response object
     * @param {Object} order The order instance
     */
    getConfirmationPageRedirect: function(res, order) {
        res.redirect(
            URLUtils.url(
                'Order-Confirm',
                'ID',
                order.orderNo,
                'token',
                order.orderToken
            ).toString()
        );
    },

    /**
     * Get the failure page redirection.
     * @param {Object} res The HTTP response object
     */
    getFailurePageRedirect: function(res) {
        res.redirect(this.getPaymentErrorUrl(PAYMENT_ERRORS.INVALID));
    },

    /**
     * Send the shopper back to checkout when their payment could not be
     * confirmed (Checkout.com unreachable). Never a decline: the order is kept,
     * so the message asks them not to pay again.
     * @param {Object} res The response
     */
    getUnverifiedPageRedirect: function(res) {
        res.redirect(this.getPaymentErrorUrl(PAYMENT_ERRORS.UNVERIFIED));
    },

    /**
     * Send the shopper back to the payment step, with no message.
     * @param {Object} res The response
     */
    getPaymentPageRedirect: function(res) {
        res.redirect(this.getPaymentErrorUrl());
    },
};

/**
 * Module exports
 */
module.exports = paymentHelper;
