'use strict';

/* API Includes */
var Logger = require('dw/system/Logger');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var constants = require('*/cartridge/config/constants');

/** Custom object type recording the webhook events already applied. */
var WEBHOOK_EVENT_TYPE = 'ckoWebhookEvent';

/** Payment statuses that hold money: an order failed with one of these must release it. */
var LIVE_PAYMENT_STATUSES = ['Authorized', 'Captured', 'Card Verified', 'Paid', 'Pending', 'Partially Captured'];

var log = Logger.getLogger('checkoutcom');

/**
 * Order state transitions that are safe when several requests handle the same
 * order at once: a 3DS or redirect return, a refresh, a second tab, a polling
 * loop and webhooks.
 *
 * SFCC uses optimistic locking: a request that loaded an order before another
 * one changed it fails to commit. So every transition re-reads the order and,
 * when it fails, re-reads it again to find out what the other request did,
 * instead of assuming the worst (failing a paid order, reversing its payment).
 *
 * A failure of the shopper's request or a lost response never proves that no
 * money moved, so an order that is failed has its payments looked up by
 * reference (the order number) and released.
 */
var orderGuard = {
    /**
     * @param {dw.order.Order} order The order
     * @returns {dw.order.Order|null} The order as currently stored
     */
    reload: function(order) {
        return order ? (OrderMgr.getOrder(order.getOrderNo()) || order) : null;
    },

    /**
     * @param {dw.order.Order} order The order
     * @returns {boolean} True when the order has been placed
     */
    isPlaced: function(order) {
        if (!order) {
            return false;
        }

        var status = order.getStatus().getValue();

        return status === Order.ORDER_STATUS_NEW
            || status === Order.ORDER_STATUS_OPEN
            || status === Order.ORDER_STATUS_COMPLETED;
    },

    /**
     * @param {dw.order.Order} order The order
     * @returns {boolean} True when the order still waits for its payment
     */
    isOpen: function(order) {
        return !!order && order.getStatus().getValue() === Order.ORDER_STATUS_CREATED;
    },

    /**
     * Place an order once. Never fails the order: the caller decides what a
     * failure means (it usually releases the payment and fails the order).
     * @param {dw.order.Order} order The order
     * @param {Object} [fraudDetectionStatus] The fraud hook result: 'flag' leaves the order not confirmed
     * @param {Object} [options] awaitingPayment: the payment is pending, so the order is not exported until it is paid
     * @returns {Object} error, alreadyPlaced (placed by another request), closed (failed or cancelled)
     */
    placeOrder: function(order, fraudDetectionStatus, options) {
        var current = this.reload(order);

        if (this.isPlaced(current)) {
            return { error: false, alreadyPlaced: true, order: current };
        }

        if (!this.isOpen(current)) {
            return { error: true, closed: true, order: current };
        }

        try {
            Transaction.begin();

            var status = OrderMgr.placeOrder(current);

            if (status.isError()) {
                throw new Error(status.getMessage() || 'placeOrder failed');
            }

            // As the SFRA placeOrder: an order flagged by fraud detection is not confirmed
            current.setConfirmationStatus(fraudDetectionStatus && fraudDetectionStatus.status === 'flag'
                ? Order.CONFIRMATION_STATUS_NOTCONFIRMED
                : Order.CONFIRMATION_STATUS_CONFIRMED);
            current.setExportStatus(options && options.awaitingPayment
                ? Order.EXPORT_STATUS_NOTEXPORTED
                : Order.EXPORT_STATUS_READY);
            Transaction.commit();

            return { error: false, alreadyPlaced: false, order: current };
        } catch (e) {
            Transaction.rollback();

            // A concurrent request (another return, a poll) may have placed it
            var after = this.reload(current);

            if (this.isPlaced(after)) {
                log.info('Order {0} was placed by a concurrent request.', after.getOrderNo());

                return { error: false, alreadyPlaced: true, order: after };
            }

            log.error('Order {0} could not be placed: {1}', current.getOrderNo(), e.message);

            return { error: true, closed: !this.isOpen(after), order: after };
        }
    },

    /**
     * Fail an order that is still waiting for its payment, and reopen the basket.
     * An order placed in the meantime is left alone.
     * @param {dw.order.Order} order The order
     * @returns {boolean} True when the order was failed by this call
     */
    failOrder: function(order) {
        var current = this.reload(order);

        if (!this.isOpen(current)) {
            return false;
        }

        try {
            Transaction.wrap(function() {
                current.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
                current.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
                OrderMgr.failOrder(current, true);
            });
        } catch (e) {
            log.warn('Order {0} could not be failed (changed by a concurrent request): {1}', current.getOrderNo(), e.message);

            return false;
        }

        return true;
    },

    /**
     * How far a webhook takes an MB WAY, Bizum or ACH payment, for the polling
     * mailbox (webhookNotification): webhooks can arrive out of order, and a
     * later but lower event (payment_pending, bank_account_updated) must not
     * hide a capture from the polling loop.
     * @param {string} eventType The webhook event type
     * @returns {number} The rank: higher wins
     */
    notificationRank: function(eventType) {
        var ranks = {
            payment_pending: 1,
            bank_account_updated: 1,
            payment_capture_pending: 2,
            payment_captured: 3,
            payment_declined: 3,
            payment_expired: 3,
        };

        return ranks[eventType] || 0;
    },

    /**
     * @param {string} eventId The webhook event id
     * @returns {boolean} True when the event was already applied
     */
    isWebhookApplied: function(eventId) {
        if (!eventId) {
            return false;
        }

        try {
            return CustomObjectMgr.getCustomObject(WEBHOOK_EVENT_TYPE, eventId) !== null;
        } catch (e) {
            // The ckoWebhookEvent type is not imported yet: webhooks still work, without de-duplication
            log.warn('Webhook de-duplication unavailable (import the ckoWebhookEvent custom object type): {0}', e.message);

            return false;
        }
    },

    /**
     * Record a webhook event as applied, so a repeated delivery is skipped.
     * @param {string} eventId The webhook event id
     * @param {string} eventType The webhook event type
     */
    markWebhookApplied: function(eventId, eventType) {
        if (!eventId) {
            return;
        }

        try {
            Transaction.wrap(function() {
                if (CustomObjectMgr.getCustomObject(WEBHOOK_EVENT_TYPE, eventId) === null) {
                    CustomObjectMgr.createCustomObject(WEBHOOK_EVENT_TYPE, eventId).custom.eventType = eventType;
                }
            });
        } catch (e) {
            // A concurrent delivery of the same event recorded it first, or the
            // ckoWebhookEvent type is not imported yet
            log.info('Webhook event {0} not recorded: {1}', eventId, e.message);
        }
    },

    /**
     * Record the gateway payment id on the payment instrument. A webhook for the
     * same order may commit in between (optimistic locking), so the write is
     * retried once on a fresh copy; a write that still fails is logged, never
     * turned into a payment failure: the payment itself went through.
     * @param {string} orderNo The order number
     * @param {dw.order.PaymentInstrument} paymentInstrument The payment instrument
     * @param {dw.order.PaymentProcessor} paymentProcessor The payment processor
     * @param {string} transactionID The gateway payment id
     */
    recordTransaction: function(orderNo, paymentInstrument, paymentProcessor, transactionID) {
        var write = function(instrument) {
            Transaction.wrap(function() {
                instrument.paymentTransaction.setTransactionID(transactionID);
                instrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
                // eslint-disable-next-line no-param-reassign
                instrument.custom.ckoPaymentData = '';
            });
        };

        try {
            write(paymentInstrument);
        } catch (e) {
            var order = OrderMgr.getOrder(orderNo);
            var fresh = order ? order.getPaymentInstruments().toArray().filter(function(instrument) {
                return instrument.getUUID() === paymentInstrument.getUUID();
            })[0] : null;

            try {
                if (!fresh) {
                    throw e;
                }

                write(fresh);
            } catch (retryError) {
                log.error('Payment {0} could not be recorded on order {1}: {2}', transactionID, orderNo, retryError.message);
            }
        }
    },

    /**
     * Find the payments made for an order (GET /payments?reference=orderNo).
     * @param {string} orderNo The order number (the payments' reference)
     * @returns {{ok: boolean, payments: Array}} ok is false when Checkout.com could not be asked
     */
    findPayments: function(orderNo) {
        if (!orderNo) {
            return { ok: true, payments: [] };
        }

        try {
            var response = ckoHelper.gatewayClientRequest(
                'cko.verify.charges.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                { query: 'reference=' + encodeURIComponent(orderNo) + '&limit=10' },
                'GET'
            );

            if (!response || typeof response !== 'object' || !Object.prototype.hasOwnProperty.call(response, 'data')) {
                return { ok: false, payments: [] };
            }

            return {
                ok: true,
                payments: (response.data || []).filter(function(payment) {
                    return payment && payment.reference === orderNo;
                }),
            };
        } catch (e) {
            log.error('Payments of order {0} could not be looked up: {1}', orderNo, e.message);

            return { ok: false, payments: [] };
        }
    },

    /**
     * @param {Object} payment A Checkout.com payment
     * @returns {boolean} True when the payment holds or took money
     */
    isLive: function(payment) {
        return !!payment && LIVE_PAYMENT_STATUSES.indexOf(payment.status) !== -1;
    },

    /**
     * Void a payment, or refund it when captured. Best effort: a failure is logged.
     * @param {Object} payment The payment (id, status)
     * @param {string} orderNo The order number, as the action reference
     * @returns {boolean} True when Checkout.com accepted the reversal
     */
    reversePayment: function(payment, orderNo) {
        var captured = payment.status === 'Captured' || payment.status === 'Paid' || payment.status === 'Partially Captured';
        var action = captured ? 'refund' : 'void';

        try {
            var response = ckoHelper.gatewayClientRequest(
                'cko.transaction.' + action + '.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                { chargeId: payment.id, reference: orderNo }
            );
            var accepted = !!response && typeof response === 'object' && !!response.action_id;

            if (accepted) {
                log.warn('Payment {0} of order {1} reversed ({2}): the order was not placed.', payment.id, orderNo, action);
            } else {
                log.error('Payment {0} of order {1} could not be reversed ({2}): {3}', payment.id, orderNo, action, JSON.stringify(response));
            }

            return accepted;
        } catch (e) {
            log.error('Payment {0} of order {1} could not be reversed ({2}): {3}', payment.id, orderNo, action, e.message);

            return false;
        }
    },

    /**
     * Release every payment that still holds money for an order that is not
     * placed: a charge whose response was lost (timeout), or a late success.
     * @param {string} orderNo The order number
     * @returns {boolean} False when the payments could not be checked
     */
    reverseStrayPayments: function(orderNo) {
        var found = this.findPayments(orderNo);
        var self = this;

        if (!found.ok) {
            log.error('Order {0} failed but its payments could not be checked: review them on the Checkout.com Dashboard.', orderNo);

            return false;
        }

        found.payments.filter(this.isLive).forEach(function(payment) {
            self.reversePayment(payment, orderNo);
        });

        return true;
    },
};

module.exports = orderGuard;
