'use strict';

/* API Includes */
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');

/**
 * Payment helper module.
 */
var paymentHelper = {
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
        res.redirect(
            URLUtils.url(
                'Checkout-Begin',
                'stage',
                'payment',
                'paymentError',
                Resource.msg('error.payment.not.valid', 'checkout', null)
            )
        );
    },

    /**
     * Send the shopper back to checkout when their payment could not be
     * confirmed (Checkout.com unreachable). Never a decline: the order is kept,
     * so the message asks them not to pay again.
     * @param {Object} res The response
     */
    getUnverifiedPageRedirect: function(res) {
        res.redirect(
            URLUtils.url(
                'Checkout-Begin',
                'stage',
                'payment',
                'paymentError',
                Resource.msg('cko.payment.unverified', 'cko', null)
            )
        );
    },

    getPaymentPageRedirect: function(res) {
        res.redirect(
            URLUtils.url(
                'Checkout-Begin',
                'stage',
                'payment',
                'paymentError',
                ''
            )
        );
    },
};

/**
 * Module exports
 */
module.exports = paymentHelper;
