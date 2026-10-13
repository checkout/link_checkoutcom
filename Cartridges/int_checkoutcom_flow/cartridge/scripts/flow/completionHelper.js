'use strict';

var BasketMgr = require('dw/order/BasketMgr');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');

var flowConfig = require('*/cartridge/scripts/flow/flowConfig');
var ckoFlowService = require('*/cartridge/scripts/services/ckoFlowService');
var sessionHelper = require('*/cartridge/scripts/flow/sessionHelper');

var PAYMENT_BINDING_TYPE = 'ckoFlowPayment';
var APPROVED_STATUSES = ['Authorized', 'Captured', 'Paid'];
var PENDING_STATUSES = ['Pending', 'Authentication Pending', 'Capture Pending'];

var log = Logger.getLogger('ckoflow');

/**
 * Verifies completed Flow payments against the gateway and turns the
 * shopper's basket into a placed order, idempotently keyed on the payment id.
 * Charge-then-order mitigation: when order creation fails after a successful
 * payment, the payment is automatically voided (or refunded when already
 * captured) and the failure is reported to the caller.
 */
var completionHelper = {
    /**
     * Look up an existing order binding for a payment id.
     * @param {string} paymentId The payment id
     * @returns {dw.object.CustomObject|null} The binding, when present
     */
    getBinding: function(paymentId) {
        return CustomObjectMgr.getCustomObject(PAYMENT_BINDING_TYPE, paymentId);
    },

    /**
     * Record the payment id -> order binding (idempotency anchor).
     * @param {string} paymentId The payment id
     * @param {dw.order.Order} order The order
     */
    createBinding: function(paymentId, order) {
        Transaction.wrap(function() {
            if (CustomObjectMgr.getCustomObject(PAYMENT_BINDING_TYPE, paymentId) === null) {
                var binding = CustomObjectMgr.createCustomObject(PAYMENT_BINDING_TYPE, paymentId);
                binding.custom.orderNo = order.getOrderNo();
            }
        });
    },

    /**
     * Reverse a payment after a post-payment failure: void when uncaptured,
     * refund when captured. Best effort — failures are logged for manual
     * follow-up and the webhook backstop.
     * @param {string} paymentId The payment id
     * @param {Object} payment The verified gateway payment
     * @param {string} reason The reversal reference
     */
    reversePayment: function(paymentId, payment, reason) {
        var captured = payment && payment.status === 'Captured';
        var result = captured
            ? ckoFlowService.refundPayment(paymentId, reason)
            : ckoFlowService.voidPayment(paymentId, reason);
        if (!result.ok) {
            log.error('Automatic {0} failed for payment {1}: {2}', captured ? 'refund' : 'void', paymentId, result.errorMessage);
        }
    },

    /**
     * Verify a payment and complete the order for the current basket.
     * @param {string} paymentId The payment id reported by Flow or the return URL
     * @returns {Object} Result: {status: 'complete'|'pending'|'failed', orderNo?, orderToken?, errorMessage?}
     */
    completePayment: function(paymentId) {
        // Idempotency: a replayed call returns the already-created order
        var existing = this.getBinding(paymentId);
        if (existing) {
            var existingOrder = OrderMgr.getOrder(existing.custom.orderNo);
            if (existingOrder) {
                return { status: 'complete', orderNo: existingOrder.getOrderNo(), orderToken: existingOrder.getOrderToken() };
            }
        }

        var verification = ckoFlowService.getPayment(paymentId);
        if (!verification.ok || !verification.object) {
            return { status: 'failed', errorMessage: 'Payment verification failed' };
        }
        var payment = verification.object;

        if (PENDING_STATUSES.indexOf(payment.status) !== -1) {
            return { status: 'pending' };
        }
        if (APPROVED_STATUSES.indexOf(payment.status) === -1) {
            return { status: 'failed', errorMessage: 'Payment not approved (status: ' + payment.status + ')' };
        }

        var basket = BasketMgr.getCurrentBasket();
        if (!basket) {
            // Payment approved but the shopper has no basket (expired session,
            // replay after teardown) — reverse to avoid an orphaned charge.
            this.reversePayment(paymentId, payment, 'sfcc_no_basket');
            return { status: 'failed', errorMessage: 'No open basket for this shopper' };
        }

        // The payment must belong to this basket and match its value
        var expectedAmount = sessionHelper.toMinorUnits(basket.getTotalGrossPrice());
        var basketMatches = payment.metadata && payment.metadata.basket_id === basket.getUUID();
        var amountMatches = payment.amount === expectedAmount && payment.currency === basket.getCurrencyCode();
        if (!basketMatches || !amountMatches) {
            this.reversePayment(paymentId, payment, 'sfcc_basket_mismatch');
            return { status: 'failed', errorMessage: 'Payment does not match the basket' };
        }

        var order = null;
        try {
            Transaction.wrap(function() {
                order = OrderMgr.createOrder(basket);

                var instruments = order.getPaymentInstruments(flowConfig.PAYMENT_METHOD_ID).toArray();
                var processor = PaymentMgr.getPaymentMethod(flowConfig.PAYMENT_METHOD_ID).getPaymentProcessor();
                for (var i = 0; i < instruments.length; i += 1) {
                    instruments[i].getPaymentTransaction().setTransactionID(paymentId);
                    instruments[i].getPaymentTransaction().setPaymentProcessor(processor);
                }

                var placeStatus = OrderMgr.placeOrder(order);
                if (placeStatus.isError()) {
                    throw new Error(placeStatus.getMessage() || 'placeOrder failed');
                }
                order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                order.setExportStatus(Order.EXPORT_STATUS_READY);
                order.setPaymentStatus(payment.status === 'Captured' ? Order.PAYMENT_STATUS_PAID : Order.PAYMENT_STATUS_NOTPAID);
            });
        } catch (e) {
            log.error('Order creation failed after approved payment {0}: {1}', paymentId, e.message);
            if (order) {
                Transaction.wrap(function() {
                    OrderMgr.failOrder(order, true);
                });
            }
            this.reversePayment(paymentId, payment, 'sfcc_order_failed');
            return { status: 'failed', errorMessage: 'Order could not be created; the payment was reversed' };
        }

        this.createBinding(paymentId, order);
        return { status: 'complete', orderNo: order.getOrderNo(), orderToken: order.getOrderToken() };
    },
};

module.exports = completionHelper;
