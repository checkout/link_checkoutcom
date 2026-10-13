'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var Transaction = require('dw/system/Transaction');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Mac = require('dw/crypto/Mac');
var Encoding = require('dw/crypto/Encoding');
var Logger = require('dw/system/Logger');

var flowConfig = require('*/cartridge/scripts/flow/flowConfig');
var completionHelper = require('*/cartridge/scripts/flow/completionHelper');

var EVENT_DEDUPE_TYPE = 'ckoFlowWebhookEvent';

var log = Logger.getLogger('ckoflow');

/**
 * Compare two strings in constant time.
 * @param {string} a First string
 * @param {string} b Second string
 * @returns {boolean} Whether equal
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
 * Webhook authentication, idempotency and order-lifecycle reconciliation.
 * Checkout completion never depends on webhooks (the storefront polls the
 * complete endpoint); webhooks keep order payment status in sync afterwards.
 */
var webhookHelper = {
    /**
     * Authenticate an incoming webhook: HMAC-SHA256 of the raw body against
     * the Cko-Signature header when present, Authorization header otherwise.
     * @param {string} rawBody The raw request body
     * @param {string} signatureHeader The Cko-Signature header value
     * @param {string} authorizationHeader The Authorization header value
     * @returns {boolean} Whether the webhook is authentic
     */
    isAuthentic: function(rawBody, signatureHeader, authorizationHeader) {
        var key = flowConfig.getPrivateSharedKey();
        if (!key) {
            return false;
        }
        if (signatureHeader) {
            var mac = new Mac(Mac.HMAC_SHA_256);
            var computed = Encoding.toHex(mac.digest(rawBody, key));
            return constantTimeEquals(computed.toLowerCase(), String(signatureHeader).toLowerCase());
        }
        return constantTimeEquals(String(authorizationHeader || ''), String(key));
    },

    /**
     * Whether the event id was already processed.
     * @param {string} eventId The event id
     * @returns {boolean} Whether already processed
     */
    isProcessed: function(eventId) {
        return !!eventId && CustomObjectMgr.getCustomObject(EVENT_DEDUPE_TYPE, eventId) !== null;
    },

    /**
     * Record a processed event id.
     * @param {string} eventId The event id
     * @param {string} eventType The event type
     */
    markProcessed: function(eventId, eventType) {
        if (!eventId) {
            return;
        }
        Transaction.wrap(function() {
            if (CustomObjectMgr.getCustomObject(EVENT_DEDUPE_TYPE, eventId) === null) {
                var record = CustomObjectMgr.createCustomObject(EVENT_DEDUPE_TYPE, eventId);
                record.custom.eventType = eventType;
            }
        });
    },

    /**
     * Resolve the order bound to a payment id.
     * @param {string} paymentId The payment id
     * @returns {dw.order.Order|null} The order
     */
    getOrderForPayment: function(paymentId) {
        var binding = completionHelper.getBinding(paymentId);
        return binding ? OrderMgr.getOrder(binding.custom.orderNo) : null;
    },

    /**
     * Apply a webhook event to the bound order.
     * @param {Object} event The webhook event ({type, data: {id, ...}})
     * @returns {boolean} Whether handling succeeded
     */
    handleEvent: function(event) {
        var paymentId = event.data && event.data.id;
        if (!paymentId) {
            return true;
        }

        var order = this.getOrderForPayment(paymentId);
        if (!order) {
            // Not an error: the event may arrive before completion, or belong
            // to a payment reversed before an order existed.
            log.info('Webhook {0} for payment {1} has no bound order yet', event.type, paymentId);
            return true;
        }

        Transaction.wrap(function() {
            switch (event.type) {
                case 'payment_captured':
                    order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                    break;
                case 'payment_refunded':
                    order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                    order.addNote('Checkout.com', 'Payment refunded (' + paymentId + ')');
                    break;
                case 'payment_voided':
                case 'payment_canceled':
                    order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
                    order.addNote('Checkout.com', 'Payment ' + event.type.replace('payment_', '') + ' (' + paymentId + ')');
                    break;
                case 'payment_declined':
                case 'payment_expired':
                    order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
                    if (order.getStatus().getValue() === Order.ORDER_STATUS_CREATED) {
                        OrderMgr.failOrder(order, true);
                    }
                    break;
                default:
                    order.addNote('Checkout.com', 'Webhook ' + event.type + ' (' + paymentId + ')');
            }
        });

        return true;
    },
};

module.exports = webhookHelper;
