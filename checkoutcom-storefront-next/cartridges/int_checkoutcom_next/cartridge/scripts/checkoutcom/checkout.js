'use strict';

var Logger = require('dw/system/Logger');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');

var config = require('*/cartridge/scripts/checkoutcom/config');
var gateway = require('*/cartridge/scripts/checkoutcom/gateway');
var ledger = require('*/cartridge/scripts/checkoutcom/ledger');
var orders = require('*/cartridge/scripts/checkoutcom/orders');
var payload = require('*/cartridge/scripts/checkoutcom/payload');

var log = Logger.getLogger(config.LOG_CATEGORY);

/**
 * Checkout operations behind the Custom API (rest-apis/checkoutcom).
 *
 * Order-first sequence, driven by the Storefront Next extension:
 *  1. createSession    payment step: payment session built from the basket
 *  2. (storefront)     Place Order: the order is created through SCAPI
 *  3. submitPayment    Flow's handleSubmit: payment submitted with reference = orderNo
 *  4. completePayment  Flow's onPaymentCompleted or the return route: verify and place
 *
 * A payment that completed without handleSubmit (a wallet paying directly)
 * still carries the basket id as its reference. The storefront then creates the
 * order through SCAPI and completes it with that basket id, and the payment is
 * accepted for the order when the amounts match (see paymentMatchesOrder).
 *
 * The instance never loads baskets itself: in a Custom API script the BasketMgr
 * lookups are agent-only (getBasket/getBaskets) or unsupported
 * (getCurrentBasket), so the storefront sends the basket with the session request.
 */

var APPROVED_STATUSES = ['Authorized', 'Captured', 'Card Verified', 'Paid'];
var PENDING_STATUSES = ['Pending'];

/**
 * @param {string} message The error message
 * @returns {Object} A failed result
 */
function failure(message) {
    return { ok: false, errorMessage: message };
}

/**
 * Accept a return URL only when its origin is allow-listed in Business Manager,
 * so the session can never send shoppers to an arbitrary site.
 * @param {string} url The URL proposed by the storefront
 * @returns {boolean} True when allowed
 */
function isAllowedReturnUrl(url) {
    var match = /^(https?:\/\/[^/?#]+)/i.exec(url || '');

    if (!match) {
        return false;
    }

    var origin = match[1].toLowerCase();

    return config.getList(config.PREFERENCES.ALLOWED_RETURN_ORIGINS).some(function(allowed) {
        return allowed.replace(/\/+$/, '').toLowerCase() === origin;
    });
}

/**
 * Void, or refund when captured, a payment that cannot be applied to an order.
 * Best effort: a failure is logged for follow-up; webhooks keep the order state.
 * @param {Object} payment The gateway payment
 * @param {string} reason The reversal reference
 */
function reversePayment(payment, reason) {
    var captured = payment.status === 'Captured' || payment.status === 'Paid';
    var result = captured
        ? gateway.refundPayment(payment.id, reason)
        : gateway.voidPayment(payment.id, reason);

    if (!result.ok) {
        log.error('Automatic {0} of payment {1} failed: {2}', captured ? 'refund' : 'void', payment.id, result.errorMessage);
    }
}

/**
 * @param {dw.order.LineItemCtnr} lineItemCtnr The order or basket
 * @param {Object} payment The gateway payment
 * @returns {boolean} True when amount and currency match
 */
function amountMatches(lineItemCtnr, payment) {
    return payment.currency === lineItemCtnr.getCurrencyCode()
        && payment.amount === payload.toMinorUnits(payload.getTotal(lineItemCtnr));
}

/**
 * Place an order for a verified, approved or pending payment.
 * @param {dw.order.Order} order The order in status CREATED
 * @param {Object} payment The verified gateway payment
 * @returns {Object} The result
 */
function placeOrder(order, payment) {
    try {
        Transaction.wrap(function() {
            ledger.recordPayment(order, payment);
            orders.bindPayment(payment.id, order);

            var status = OrderMgr.placeOrder(order);

            if (status.isError()) {
                throw new Error(status.getMessage() || 'placeOrder failed');
            }

            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
            order.setExportStatus(Order.EXPORT_STATUS_READY);
        });
    } catch (e) {
        log.error('Order {0} could not be placed for payment {1}: {2}', order.getOrderNo(), payment.id, e.message);
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });
        reversePayment(payment, 'sfcc_place_order_failed');

        return failure('The order could not be placed; the payment has been reversed.');
    }

    // A pending payment (Multibanco, vouchers) still places the order, unpaid;
    // the payment_approved / payment_captured webhooks settle it later.
    return {
        ok: true,
        status: 'complete',
        pending: PENDING_STATUSES.indexOf(payment.status) !== -1,
        orderNo: order.getOrderNo(),
        orderToken: order.getOrderToken(),
    };
}

/**
 * Fail an order that is still waiting for payment and give the shopper their
 * basket back.
 * @param {dw.order.Order} order The order
 */
function failOrder(order) {
    if (orders.isAwaitingPayment(order)) {
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });
    }
}

/**
 * @param {Object} payment The gateway payment
 * @returns {boolean} True when approved
 */
function isApproved(payment) {
    return APPROVED_STATUSES.indexOf(payment.status) !== -1;
}

/**
 * @param {Object} payment The gateway payment
 * @returns {boolean} True when still pending
 */
function isPending(payment) {
    return PENDING_STATUSES.indexOf(payment.status) !== -1;
}

/**
 * @param {dw.order.Order} order The order
 * @returns {Object} A complete result for an order
 */
function completed(order) {
    return { ok: true, status: 'complete', orderNo: order.getOrderNo(), orderToken: order.getOrderToken() };
}

/**
 * @param {string} message The message shown to the shopper
 * @returns {Object} A failed payment result
 */
function declined(message) {
    return { ok: true, status: 'failed', errorMessage: message };
}

/**
 * A payment belongs to an order when its reference is the order number (it was
 * submitted for it), or when it was made for the basket the order was created
 * from (a wallet that paid before the order existed), with the same amount, and
 * no other order is already paid with it.
 * @param {dw.order.Order} order The order
 * @param {Object} payment The gateway payment
 * @param {string} [basketId] The basket the storefront created the order from
 * @returns {boolean} True when the payment may be applied to the order
 */
function paymentMatchesOrder(order, payment, basketId) {
    var forOrder = payment.reference === order.getOrderNo();
    var forBasket = !!basketId && payment.metadata && payment.metadata.basket_id === basketId;

    if ((!forOrder && !forBasket) || !amountMatches(order, payment)) {
        return false;
    }

    var boundOrderNo = orders.getBoundOrderNo(payment.id);

    return !boundOrderNo || boundOrderNo === order.getOrderNo();
}

/**
 * Complete a payment that was submitted for an order (the order-first path).
 * @param {dw.order.Order} order The shopper's order
 * @param {Object} payment The verified gateway payment
 * @returns {Object} The result
 */
function completeForOrder(order, payment, basketId) {
    if (orders.isPlaced(order)) {
        return order.custom.ckoPaymentId === payment.id
            ? completed(order)
            : failure('The order was already paid with another payment.');
    }

    if (!orders.isAwaitingPayment(order)) {
        if (isApproved(payment)) {
            reversePayment(payment, 'sfcc_order_closed');
        }

        return declined('The order is no longer open.');
    }

    if (!paymentMatchesOrder(order, payment, basketId)) {
        log.error('Payment {0} does not match order {1}.', payment.id, order.getOrderNo());
        failOrder(order);

        if (isApproved(payment) || isPending(payment)) {
            reversePayment(payment, 'sfcc_order_mismatch');
        }

        return declined('The payment does not match the order.');
    }

    if (!isApproved(payment) && !isPending(payment)) {
        failOrder(order);

        return declined('The payment was not approved (' + payment.status + ').');
    }

    return placeOrder(order, payment);
}

module.exports = {
    isAllowedReturnUrl: isAllowedReturnUrl,

    /**
     * Create a payment session for the shopper's basket.
     * @param {Object} input basket (Shopper Baskets JSON), successUrl, failureUrl, locale
     * @returns {Object} ok + paymentSession, publicKey, environment; or errorMessage
     */
    createSession: function(input) {
        var basket = input.basket;

        if (!basket || !basket.basketId || !basket.productItems || basket.productItems.length === 0) {
            return failure('The basket is missing or has no items.');
        }

        if (typeof basket.orderTotal !== 'number' || !basket.currency) {
            return failure('The basket has no order total yet (taxes and shipping must be calculated).');
        }

        if (!config.isEnabled()) {
            return failure('Checkout.com Flow is switched off: enable the CHECKOUTCOM_FLOW payment method.');
        }

        if (!isAllowedReturnUrl(input.successUrl) || !isAllowedReturnUrl(input.failureUrl)) {
            return failure('The return URLs are not allowed. Add the storefront origin to ckoFlowAllowedReturnOrigins.');
        }

        if (!config.getSecretKey() || !config.getPublicKey()) {
            return failure('The Checkout.com secret and public keys are not configured.');
        }

        var request = payload.buildSessionRequest(basket, input);

        if (!request.billing || !request.billing.address || !request.billing.address.country) {
            return failure('The basket has no billing or shipping address yet.');
        }

        var result = gateway.createPaymentSession(request);

        if (!result.ok || !result.object || !result.object.id) {
            log.error('Payment session creation failed for basket {0}: {1}', basket.basketId, result.errorMessage);

            return failure('The payment session could not be created.');
        }

        log.info('Payment session {0} created for basket {1} ({2} {3}).', result.object.id, basket.basketId, basket.orderTotal, basket.currency);

        return {
            ok: true,
            paymentSession: result.object,
            publicKey: config.getPublicKey(),
            environment: config.getEnvironment(),
            appearance: config.getAppearance(),
            componentOptions: config.getComponentOptions(),
            translations: config.getTranslations(),
        };
    },

    /**
     * Submit the payment Flow collected, for an order the storefront just created.
     * @param {Object} input sessionId, sessionData, orderNo
     * @returns {Object} ok + response (returned to Flow unmodified); or errorMessage
     */
    submitPayment: function(input) {
        var order = orders.getShopperOrder(input.orderNo);

        if (!order || !orders.isAwaitingPayment(order)) {
            return failure('The order is not waiting for a Checkout.com payment.');
        }

        var result = gateway.submitPaymentSession(input.sessionId, payload.buildSubmitRequest(order, input.sessionData));

        if (!result.ok || !result.object) {
            log.warn('Payment submission failed for order {0}: {1}', order.getOrderNo(), result.errorMessage);

            return failure('The payment could not be submitted.');
        }

        log.info('Payment {0} submitted for order {1}: {2}.', result.object.id, order.getOrderNo(), result.object.status);

        if (result.object.id) {
            Transaction.wrap(function() {
                order.custom.ckoPaymentId = result.object.id;
                orders.bindPayment(result.object.id, order);
            });
        }

        return { ok: true, response: result.object };
    },

    /**
     * Verify a payment against the gateway and place its order. Idempotent: a
     * repeated call for a placed order returns the same result.
     * @param {Object} input paymentId, orderNo (else the payment reference), and the basketId
     *     the order was created from when the payment was made before the order existed
     * @returns {Object} ok + status (complete|failed), pending, orderNo, orderToken; or errorMessage
     */
    completePayment: function(input) {
        var verification = gateway.getPayment(input.paymentId);

        if (!verification.ok || !verification.object) {
            return failure('The payment could not be verified.');
        }

        var payment = verification.object;
        var order = orders.getShopperOrder(input.orderNo || payment.reference);

        log.info('Completing payment {0} ({1}, {2} {3}) for order {4}.', payment.id, payment.status, payment.amount, payment.currency, order ? order.getOrderNo() : 'none');

        if (!order) {
            return failure('No order was found for this payment.');
        }

        return completeForOrder(order, payment, input.basketId);
    },
};
