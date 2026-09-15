'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');

/* Checkout Helpers */
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Transport-neutral handling of the gateway redirect return legs (3DS and APM).
 * Used by the SFRA CKOMain controller and by the SCAPI custom endpoints, so it
 * never renders or redirects — it verifies the gateway session, transitions the
 * order and reports the outcome to the caller.
 */
var returnHandler = {
    /**
     * Verify a cko-session-id against the gateway.
     * @param {string} ckoSessionId The gateway session id from the return URL
     * @returns {Object} The gateway verify response
     */
    verifySession: function(ckoSessionId) {
        var mode = ckoHelper.getValue(constants.CKO_MODE);
        return ckoHelper.gatewayClientRequest(
            'cko.verify.charges.' + mode + '.service',
            {
                paymentToken: ckoSessionId,
            }
        );
    },

    /**
     * Fail an order and reset its payment/confirmation status.
     * @param {dw.order.Order} order The order
     */
    failOrder: function(order) {
        Transaction.wrap(function() {
            order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
            order.setConfirmationStatus(order.CONFIRMATION_STATUS_NOTCONFIRMED);
            OrderMgr.failOrder(order, true);
        });
    },

    /**
     * Handle the gateway success return leg: verify the session, place the order
     * and set the payment status from the verified gateway state.
     * @param {string} ckoSessionId The gateway session id from the return URL
     * @returns {Object} Result with outcome ('confirmed'|'failed'|'invalid') and the order
     */
    handleReturn: function(ckoSessionId) {
        var result = { outcome: 'invalid', order: null };

        var gVerify = this.verifySession(ckoSessionId);
        var hasReference = gVerify && typeof gVerify === 'object'
            && Object.prototype.hasOwnProperty.call(gVerify, 'reference') && gVerify.reference;
        if (!hasReference) {
            return result;
        }

        var order = OrderMgr.getOrder(gVerify.reference);
        result.order = order;

        var isValidResult = order
            && Object.prototype.hasOwnProperty.call(gVerify, 'id')
            && ckoHelper.redirectPaymentSuccess(gVerify);
        if (isValidResult) {
            var placeOrderResult = COHelpers.placeOrder(order, { status: '' });
            if (placeOrderResult.error) {
                this.failOrder(order);
                result.outcome = 'failed';
            } else {
                Transaction.wrap(function() {
                    // Payment status: PAID if gateway confirms Captured, NOT PAID if Pending
                    if (gVerify.status === 'Captured') {
                        order.setPaymentStatus(order.PAYMENT_STATUS_PAID);
                    } else {
                        order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                    }
                    order.setConfirmationStatus(order.CONFIRMATION_STATUS_CONFIRMED);
                });
                result.outcome = 'confirmed';
            }
        } else if (order) {
            this.failOrder(order);
            result.outcome = 'failed';
        }

        return result;
    },

    /**
     * Place an order from a direct (non session-id) gateway success return.
     * @param {string} reference The order number from the return URL
     * @returns {Object} Result with outcome ('confirmed'|'failed'|'invalid') and the order
     */
    handleDirectReturn: function(reference) {
        var result = { outcome: 'invalid', order: null };

        var order = OrderMgr.getOrder(reference);
        if (!order) {
            return result;
        }
        result.order = order;

        var placeOrderResult = COHelpers.placeOrder(order, { status: '' });
        if (placeOrderResult.error) {
            Transaction.wrap(function() {
                OrderMgr.failOrder(order, true);
            });
            result.outcome = 'failed';
        } else {
            result.outcome = 'confirmed';
        }

        return result;
    },

    /**
     * Handle the gateway failure return leg: restore the basket and fail the order.
     * @param {string} ckoSessionId The gateway session id from the return URL
     * @returns {Object} Result with outcome ('failed'|'invalid') and the order
     */
    handleFail: function(ckoSessionId) {
        var result = { outcome: 'invalid', order: null };

        var gVerify = this.verifySession(ckoSessionId);
        var hasReference = gVerify && typeof gVerify === 'object'
            && Object.prototype.hasOwnProperty.call(gVerify, 'reference') && gVerify.reference;
        if (!hasReference) {
            return result;
        }

        var order = OrderMgr.getOrder(gVerify.reference);
        if (order) {
            result.order = order;

            // Restore the cart
            ckoHelper.checkAndRestoreBasket(order);

            this.failOrder(order);
            result.outcome = 'failed';
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = returnHandler;
