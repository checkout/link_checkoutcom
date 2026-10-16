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
            Logger.getLogger('checkoutcom').error(
                'Flow payment {0} for order {1} could not be read back from the gateway.',
                paymentId,
                order.getOrderNo()
            );

            this.failOrder(order);

            return { error: true, order: null };
        }

        ckoHelper.log(flowConfig.PAYMENT_PROCESSOR_ID + ' payment verification', payment);

        if (!flowHelper.matchesOrder(payment, order)) {
            this.failOrder(order);

            return { error: true, order: null };
        }

        var isApproved = flowHelper.isApproved(payment);
        var isPending = flowHelper.isPending(payment);

        if (!isApproved && !isPending) {
            this.failOrder(order);

            return { error: true, order: null };
        }

        this.updateTransaction(order, payment);

        var placeOrderResult = COHelpers.placeOrder(order, { status: '' });

        if (placeOrderResult.error) {
            // The shopper has already paid, so the authorization is released
            // before the order is failed to avoid stranding their funds.
            flowHelper.voidPayment(payment.id, order.getOrderNo());
            this.failOrder(order);

            return { error: true, order: null };
        }

        Transaction.wrap(function() {
            // Pending methods such as Multibanco settle later through the
            // existing Checkout.com webhook handlers.
            order.setPaymentStatus(payment.status === 'Captured'
                ? Order.PAYMENT_STATUS_PAID
                : Order.PAYMENT_STATUS_NOTPAID);
            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
        });

        return {
            error: false,
            order: order,
            payment: payment,
            pending: isPending,
        };
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

        // OrderMgr.failOrder() only accepts orders that have not been placed yet.
        // COHelpers.placeOrder() fails the order itself when it cannot place it,
        // so the transition is skipped when it has already happened.
        if (order.getStatus().getValue() === Order.ORDER_STATUS_CREATED) {
            Transaction.wrap(function() {
                order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
                order.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
                OrderMgr.failOrder(order, true);
            });
        }

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

        Logger.getLogger('checkoutcom').info(
            'Reclaiming abandoned Flow order {0} and restoring the shopper basket.',
            orderNo
        );

        this.failOrder(order);
        this.clearSession();

        return true;
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
