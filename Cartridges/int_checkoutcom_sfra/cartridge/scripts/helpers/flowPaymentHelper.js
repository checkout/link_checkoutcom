'use strict';

/* API Includes */
var BasketMgr = require('dw/order/BasketMgr');
var Logger = require('dw/system/Logger');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var Transaction = require('dw/system/Transaction');

/* Checkout helpers */
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var flowHelper = require('*/cartridge/scripts/helpers/flowHelper');
var orderGuard = require('*/cartridge/scripts/helpers/orderGuard');

/* Configuration */
var flowConfig = require('*/cartridge/config/ckoFlowConfig');

/**
 * Checkout.com Flow order helper.
 *
 * Turns a payment taken by the Flow web component into a placed SFRA order, and
 * cleans up when the shopper abandons or the gateway declines.
 */
var flowPaymentHelper = {
    /**
     * Load the order the Flow page is currently working on.
     * The order number is only accepted when it matches the value stored in the
     * session by the Authorize hook, so a shopper can never settle somebody
     * else's order by guessing an order number.
     * @param {string} orderNo The order number to load
     * @returns {dw.order.Order|null} The order, or null when it is not valid
     */
    getSessionOrder: function(orderNo) {
        // eslint-disable-next-line no-undef
        var expectedOrderNo = session.privacy.ckoFlowOrderNo;

        if (!orderNo || !expectedOrderNo || orderNo !== expectedOrderNo) {
            return null;
        }

        return this.getPayableOrder(orderNo);
    },

    /**
     * Load an order that is still waiting for its Flow payment.
     * Anything already placed, failed or paid for with another method is
     * rejected, so a payment can never be applied to an order twice.
     * @param {string} orderNo The order number to load
     * @returns {dw.order.Order|null} The order, or null when it cannot be paid for
     */
    getPayableOrder: function(orderNo) {
        if (!orderNo) {
            return null;
        }

        var order = OrderMgr.getOrder(orderNo);

        if (!order || order.getStatus().getValue() !== Order.ORDER_STATUS_CREATED) {
            return null;
        }

        if (order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).size() === 0) {
            return null;
        }

        return order;
    },

    /**
     * Resolve the order and payment behind a gateway redirect.
     *
     * The shopper session is normally still intact on the way back from an
     * offsite payment method, but some methods lose it. The reference on the
     * payment itself is used as a fallback: that is safe because the payment id
     * only ever reaches the storefront through the gateway redirect, and only an
     * unplaced Flow order is accepted.
     * @param {string} paymentId The payment id from the redirect
     * @returns {Object} The resolved order and payment
     */
    resolveReturnOrder: function(paymentId) {
        var payment = flowHelper.getPaymentDetails(paymentId);

        if (!payment) {
            return { order: null, payment: null };
        }

        var order = this.getSessionOrder(payment.reference);

        if (!order) {
            order = this.getPayableOrder(payment.reference);
        }

        return { order: order, payment: payment };
    },

    /**
     * Record the gateway payment against the order's payment transaction.
     * @param {dw.order.Order} order The order instance
     * @param {Object} payment The payment data read back from the gateway
     */
    updateTransaction: function(order, payment) {
        var flowInstruments = order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).toArray();
        var paymentInstrument = flowInstruments.length > 0
            ? flowInstruments[0]
            : order.getPaymentInstruments().toArray()[0];

        if (!paymentInstrument) {
            return;
        }

        var paymentProcessor = PaymentMgr
            .getPaymentMethod(flowConfig.PAYMENT_METHOD_ID)
            .getPaymentProcessor();

        Transaction.wrap(function() {
            var paymentTransaction = paymentInstrument.getPaymentTransaction();

            paymentTransaction.setTransactionID(payment.id);
            paymentTransaction.setPaymentProcessor(paymentProcessor);
            paymentTransaction.setType(
                payment.status === 'Captured'
                    ? PaymentTransaction.TYPE_CAPTURE
                    : PaymentTransaction.TYPE_AUTH
            );

            /* eslint-disable no-param-reassign */
            paymentTransaction.custom.ckoTransactionOpened = payment.status !== 'Captured';
            paymentTransaction.custom.ckoTransactionType = payment.status === 'Captured'
                ? 'Capture'
                : 'Authorization';

            if (payment.action_id) {
                paymentTransaction.custom.ckoActionId = payment.action_id;
            }

            // The Flow component decides which method the shopper pays with, so
            // the resolved method is stored for the order detail views and the
            // Business Manager transaction tools.
            if (payment.source && payment.source.type) {
                paymentInstrument.custom.ckoPaymentData = JSON.stringify({
                    type: payment.source.type,
                    scheme: payment.source.scheme || null,
                    last4: payment.source.last4 || null,
                });
            }
            /* eslint-enable no-param-reassign */
        });
    },

    /**
     * Place an order whose Flow payment has been confirmed by the gateway.
     * On any failure the order is failed and the shopper's basket restored here,
     * so callers only have to decide where to send the shopper next.
     * @param {dw.order.Order} order The order instance
     * @param {string} paymentId The payment or payment session id returned by Flow
     * @param {Object} [prefetchedPayment] A payment already read back from the gateway
     * @returns {Object} The result, holding either the placed order or an error
     */
    completeOrder: function(order, paymentId, prefetchedPayment) {
        var payment = prefetchedPayment || flowHelper.getPaymentDetails(paymentId);

        if (!payment) {
            // Not knowing is not a decline: the order stays open for a retry, the
            // webhooks or the abandoned-order check, and the shopper is told so
            Logger.getLogger('checkoutcom').error(
                'Flow payment {0} for order {1} could not be read back from the gateway; the order is kept.',
                paymentId,
                order.getOrderNo()
            );

            return { error: true, unverified: true, order: null };
        }

        ckoHelper.log(flowConfig.PAYMENT_PROCESSOR_ID + ' payment verification', payment);

        // Placed already by a concurrent request (Complete and HandleReturn, a refresh)
        var current = orderGuard.reload(order);

        if (orderGuard.isPlaced(current)) {
            return this.settlePlacedOrder(current, payment);
        }

        if (!flowHelper.matchesOrder(payment, order)) {
            if (orderGuard.isLive(payment)) {
                orderGuard.reversePayment(payment, order.getOrderNo());
            }

            this.failOrder(order);

            return { error: true, order: null };
        }

        var isApproved = flowHelper.isApproved(payment);
        var isPending = flowHelper.isPending(payment);

        if (!isApproved && !isPending) {
            this.failOrder(order);

            return { error: true, order: null };
        }

        try {
            this.updateTransaction(order, payment);
        } catch (e) {
            // A webhook wrote the order at the same moment; placement re-reads it
            Logger.getLogger('checkoutcom').warn('Flow payment {0} not recorded on order {1} before placement: {2}', payment.id, order.getOrderNo(), e.message);
        }

        var placed = orderGuard.placeOrder(order);

        if (placed.error) {
            // Not placed, and not by anyone else: release the shopper's funds
            // (void, or refund when captured), then fail the order
            orderGuard.reversePayment(payment, order.getOrderNo());
            this.failOrder(placed.order);

            return { error: true, order: null };
        }

        if (placed.alreadyPlaced) {
            return this.settlePlacedOrder(placed.order, payment);
        }

        var placedOrder = placed.order;

        try {
            Transaction.wrap(function() {
                // Pending methods such as Multibanco settle later through the
                // existing Checkout.com webhook handlers. A PAID set by a capture
                // webhook in the meantime is never downgraded.
                if (payment.status === 'Captured') {
                    placedOrder.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                } else if (placedOrder.getPaymentStatus().getValue() !== Order.PAYMENT_STATUS_PAID) {
                    placedOrder.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
                }
                placedOrder.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
            });
        } catch (e) {
            Logger.getLogger('checkoutcom').warn('Flow order {0}: payment status not updated after placement: {1}', placedOrder.getOrderNo(), e.message);
        }

        return {
            error: false,
            order: placedOrder,
            payment: payment,
            pending: isPending,
        };
    },

    /**
     * A payment completing an order that another request already placed. Its
     * own payment: the same success again. A second payment that took money
     * for it: released, and the order is still complete.
     * @param {dw.order.Order} order The placed order
     * @param {Object} payment The payment read back from the gateway
     * @returns {Object} The result
     */
    settlePlacedOrder: function(order, payment) {
        var instruments = order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).toArray();
        var recorded = instruments.length > 0 ? instruments[0].getPaymentTransaction().getTransactionID() : null;

        if (recorded && recorded !== payment.id && orderGuard.isLive(payment)) {
            Logger.getLogger('checkoutcom').warn('Flow payment {0} is a second payment for order {1}, paid with {2}: releasing it.', payment.id, order.getOrderNo(), recorded);
            orderGuard.reversePayment(payment, order.getOrderNo());
        }

        return {
            error: false,
            alreadyPlaced: true,
            order: order,
            payment: payment,
            pending: flowHelper.isPending(payment),
        };
    },

    /**
     * The Flow order of this session (or named by the payment's reference) when
     * it has already been placed, by a concurrent Complete or HandleReturn.
     * @param {string} orderNo The order number
     * @returns {dw.order.Order|null} The placed order, or null
     */
    getPlacedFlowOrder: function(orderNo) {
        var order = orderNo ? OrderMgr.getOrder(orderNo) : null;

        if (!orderGuard.isPlaced(order) || order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).size() === 0) {
            return null;
        }

        return order;
    },

    /**
     * Give up on an order's Flow payment: fail it and give the basket back,
     * unless Checkout.com has a payment for it, which then completes it. Used
     * whenever the shopper leaves the payment page without a result, because
     * leaving proves nothing about the payment.
     * @param {dw.order.Order} order The order, still waiting for its payment
     * @returns {Object} complete (placed instead), failed, or unverified (kept open)
     */
    releaseOrder: function(order) {
        var found = orderGuard.findPayments(order.getOrderNo());

        if (!found.ok) {
            Logger.getLogger('checkoutcom').warn('Flow order {0} kept open: its payments could not be checked.', order.getOrderNo());

            return { status: 'unverified' };
        }

        var live = found.payments.filter(function(payment) {
            return flowHelper.isApproved(payment) || flowHelper.isPending(payment);
        });

        if (live.length > 0) {
            var result = this.completeOrder(order, live[0].id);

            return {
                status: result.error ? (result.unverified ? 'unverified' : 'failed') : 'complete',
                order: result.order,
                alreadyPlaced: !!result.alreadyPlaced,
            };
        }

        this.failOrder(order);

        return { status: 'failed' };
    },

    /**
     * Fail an order whose Flow payment did not go through and give the shopper
     * their basket back so they can retry.
     * @param {dw.order.Order} order The order instance
     */
    failOrder: function(order) {
        if (!order) {
            return;
        }

        // Only an order still waiting for its payment is failed, re-read first:
        // one placed by a concurrent request is left alone
        orderGuard.failOrder(order);
        order = orderGuard.reload(order); // eslint-disable-line no-param-reassign

        if (order.getStatus().getValue() === Order.ORDER_STATUS_FAILED) {
            // No-op when the shopper already has a basket, so calling this more
            // than once per request cannot duplicate their items.
            ckoHelper.checkAndRestoreBasket(order);
            this.restoreCoupons(order);
        }
    },

    /**
     * Re-apply the order's coupon codes to the restored basket.
     *
     * ckoHelper.checkAndRestoreBasket() rebuilds the product line items,
     * addresses and shipping method but not the coupons, so a shopper who went
     * back to change payment method would silently lose their promotions.
     * @param {dw.order.Order} order The order the basket was restored from
     */
    restoreCoupons: function(order) {
        var basket = BasketMgr.getCurrentBasket();

        if (!basket || order.getCouponLineItems().size() === 0) {
            return;
        }

        var couponIterator = order.getCouponLineItems().iterator();

        while (couponIterator.hasNext()) {
            var couponLineItem = couponIterator.next();
            var couponCode = couponLineItem.getCouponCode();

            try {
                // Re-adding a code the basket already carries throws, so the
                // existing codes are checked first.
                if (couponCode && !this.hasCoupon(basket, couponCode)) {
                    Transaction.wrap(function() { // eslint-disable-line no-loop-func
                        basket.createCouponLineItem(couponCode, true);
                    });
                }
            } catch (e) {
                // A coupon can legitimately no longer apply, for example when it
                // has since expired or hit its redemption limit. Losing one must
                // not stop the rest of the basket being restored.
                Logger.getLogger('checkoutcom').warn(
                    'Flow could not re-apply coupon {0} from order {1}: {2}',
                    couponCode,
                    order.getOrderNo(),
                    e.message
                );
            }
        }
    },

    /**
     * Check whether a basket already carries a coupon code.
     * @param {dw.order.Basket} basket The current basket
     * @param {string} couponCode The coupon code to look for
     * @returns {boolean} True when the code is already applied
     */
    hasCoupon: function(basket, couponCode) {
        var existing = basket.getCouponLineItems().iterator();

        while (existing.hasNext()) {
            if (existing.next().getCouponCode() === couponCode) {
                return true;
            }
        }

        return false;
    },

    /**
     * Give the shopper their basket back when they abandon the Flow page.
     *
     * The order is created by the standard SFRA place order route, which
     * consumes the basket, and only CKOFlow-HandleFail hands it back. A shopper
     * who uses the browser back button or the cart link never reaches that
     * route, so this is called from Cart-Show and Checkout-Begin to reclaim any
     * order that is still waiting for its Flow payment.
     *
     * Orders that are already placed, or whose payment is authorized, captured
     * or pending, are in ORDER_STATUS_NEW or later and are left untouched.
     * @returns {boolean} True when an order was reclaimed
     */
    reclaimAbandonedOrder: function() {
        // eslint-disable-next-line no-undef
        var orderNo = session.privacy.ckoFlowOrderNo;

        if (!orderNo) {
            return false;
        }

        var order = this.getPayableOrder(orderNo);

        if (!order) {
            // Already placed, already failed, or not a Flow order: nothing to
            // reclaim, so just drop the stale session keys.
            this.clearSession();

            return false;
        }

        // The shopper left the payment page, which proves nothing about the
        // payment: one that went through completes the order instead
        var released = this.releaseOrder(order);

        Logger.getLogger('checkoutcom').info(
            'Abandoned Flow order {0}: {1}.',
            orderNo,
            released.status
        );

        if (released.status === 'unverified') {
            // Kept open; checked again on the next visit
            return false;
        }

        this.clearSession();

        return released.status === 'failed';
    },

    /**
     * Send the order confirmation email, mirroring the behaviour of the standard
     * SFRA place order route. A mail failure must never fail a paid order.
     * @param {dw.order.Order} order The order instance
     * @param {string} localeId The request locale id
     */
    sendConfirmationEmail: function(order, localeId) {
        try {
            if (order.getCustomerEmail()) {
                COHelpers.sendConfirmationEmail(order, localeId);
            }
        } catch (e) {
            Logger.getLogger('checkoutcom').error(
                'Flow confirmation email for order {0} could not be sent: {1}',
                order.getOrderNo(),
                e.message
            );
        }
    },

    /**
     * Clear the Flow keys from the shopper session once the order is settled.
     */
    clearSession: function() {
        /* eslint-disable no-undef */
        session.privacy.ckoFlowOrderNo = null;
        session.privacy.ckoFlowSessionId = null;
        /* eslint-enable no-undef */
    },
};

/*
 * Module exports
 */
module.exports = flowPaymentHelper;
