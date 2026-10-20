'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Encoding = require('dw/crypto/Encoding');
var Logger = require('dw/system/Logger');
var Mac = require('dw/crypto/Mac');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');

var config = require('*/cartridge/scripts/checkoutcom/config');
var ledger = require('*/cartridge/scripts/checkoutcom/ledger');
var orders = require('*/cartridge/scripts/checkoutcom/orders');

var EVENT_TYPE = 'ckoWebhookEvent';

var log = Logger.getLogger(config.LOG_CATEGORY);

/**
 * Compare two strings in constant time.
 * @param {string} a First string
 * @param {string} b Second string
 * @returns {boolean} True when equal
 */
function constantTimeEquals(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    var result = 0;

    for (var i = 0; i < a.length; i += 1) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i); // eslint-disable-line no-bitwise
    }

    return result === 0;
}

/**
 * Webhook authentication, de-duplication and order reconciliation.
 * Checkout never waits for webhooks: completion is synchronous. Webhooks keep
 * the order and the BM transaction ledger in step afterwards (captures,
 * refunds, voids, late approvals and declines).
 */
module.exports = {
    /**
     * Authenticate a webhook: HMAC-SHA256 of the raw body in Cko-Signature, or
     * the shared key in the Authorization header for endpoints set up that way.
     * @param {string} rawBody The raw request body
     * @param {string} signature The Cko-Signature header
     * @param {string} authorization The Authorization header
     * @returns {boolean} True when authentic
     */
    isAuthentic: function(rawBody, signature, authorization) {
        var key = config.getPrivateSharedKey();

        if (!key) {
            return false;
        }

        if (signature) {
            var computed = Encoding.toHex(new Mac(Mac.HMAC_SHA_256).digest(rawBody, key));

            return constantTimeEquals(computed.toLowerCase(), String(signature).toLowerCase());
        }

        return !!authorization && constantTimeEquals(String(authorization), String(key));
    },

    /**
     * @param {string} eventId The event id
     * @returns {boolean} True when the event was already processed
     */
    isProcessed: function(eventId) {
        return !!eventId && CustomObjectMgr.getCustomObject(EVENT_TYPE, eventId) !== null;
    },

    /**
     * @param {string} eventId The event id
     * @param {string} eventType The event type
     */
    markProcessed: function(eventId, eventType) {
        if (!eventId) {
            return;
        }

        Transaction.wrap(function() {
            if (CustomObjectMgr.getCustomObject(EVENT_TYPE, eventId) === null) {
                CustomObjectMgr.createCustomObject(EVENT_TYPE, eventId).custom.eventType = eventType;
            }
        });
    },

    /**
     * Apply an event to its order.
     * @param {Object} event The webhook event ({ id, type, data })
     */
    handleEvent: function(event) {
        var data = event.data || {};
        // Webhooks have no shopper session: the order is loaded through its
        // payment binding (order number + token), see orders.getBoundOrder
        var order = orders.getBoundOrder(data.id);

        log.info('Webhook {0} {1} received for payment {2} (action {3}, reference {4}).', event.id, event.type, data.id, data.action_id, data.reference);

        if (!order) {
            // Expected when the event belongs to a payment that never got an
            // order (reversed at checkout) or to another integration.
            log.info('Webhook {0} {1}: payment {2} has no bound order; nothing to update.', event.id, event.type, data.id);

            return;
        }

        Transaction.wrap(function() {
            switch (event.type) {
                case 'payment_captured':
                    ledger.recordAction(order, 'Capture', data);
                    break;
                case 'payment_refunded':
                    ledger.recordAction(order, 'Refund', data);
                    break;
                case 'payment_voided':
                    ledger.recordAction(order, 'Void', data);
                    break;
                case 'payment_declined':
                case 'payment_expired':
                case 'payment_canceled':
                    if (order.getStatus().getValue() === Order.ORDER_STATUS_CREATED) {
                        OrderMgr.failOrder(order, true);
                    } else if (order.getPaymentStatus().getValue() !== Order.PAYMENT_STATUS_PAID) {
                        order.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
                    }
                    break;
                default:
                    break;
            }

            order.addNote('Checkout.com', event.type + ' (' + data.id + ')');
        });

        log.info('Webhook {0} {1} applied to order {2}; payment status {3}.', event.id, event.type, order.getOrderNo(), order.getPaymentStatus().getDisplayValue ? order.getPaymentStatus().getDisplayValue() : order.getPaymentStatus().getValue());
    },
};
