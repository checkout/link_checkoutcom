'use strict';

/* API Includes */
var Status = require('dw/system/Status');
var PaymentMgr = require('dw/order/PaymentMgr');
var HookMgr = require('dw/system/HookMgr');
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');
var Order = require('dw/order/Order');
var Resource = require('dw/web/Resource');

/**
 * SCAPI Shopper Orders hooks.
 * When a headless storefront (Storefront Next / PWA Kit) creates an order via
 * SCAPI, the SFRA CheckoutServices-PlaceOrder controller never runs. This hook
 * runs the same app.payment.processor Authorize chain at order creation and
 * records the outcome so the storefront can continue the flow:
 * - synchronous success: the order is placed and confirmed
 * - 3DS/APM redirect: order.custom.ckoRedirectUrl is set (exposed as
 *   c_ckoRedirectUrl on the order response) and the shopper is redirected;
 *   the gateway return leg completes the order
 * - async APMs (MB WAY, Bizum, ACH): the order stays created; the storefront
 *   polls the payment-status custom endpoint until the webhook resolves it
 */

/**
 * Get the Checkout.com payment instruments on an order.
 * @param {dw.order.Order} order The order
 * @returns {Array} The order's Checkout.com payment instruments
 */
function getCkoPaymentInstruments(order) {
    var result = [];
    var instruments = order.getPaymentInstruments().toArray();
    for (var i = 0; i < instruments.length; i += 1) {
        var method = PaymentMgr.getPaymentMethod(instruments[i].getPaymentMethod());
        var processor = method && method.getPaymentProcessor();
        if (processor && processor.getID().indexOf('CHECKOUTCOM_') === 0) {
            result.push({ instrument: instruments[i], processor: processor });
        }
    }
    return result;
}

/**
 * Authorize the order's Checkout.com payment instruments after SCAPI order creation.
 * @param {dw.order.Order} order The created order
 * @returns {dw.system.Status} The hook status
 */
exports.afterPOST = function(order) {
    var ckoInstruments = getCkoPaymentInstruments(order);
    if (ckoInstruments.length === 0) {
        return new Status(Status.OK);
    }

    var redirectUrl = null;
    var isPending = false;

    for (var i = 0; i < ckoInstruments.length; i += 1) {
        var paymentInstrument = ckoInstruments[i].instrument;
        var processor = ckoInstruments[i].processor;

        var hookName = 'app.payment.processor.' + processor.getID().toLowerCase();
        if (!HookMgr.hasHook(hookName)) {
            hookName = 'app.payment.processor.default';
        }

        var authResult = HookMgr.callHook(hookName, 'Authorize', order.orderNo, paymentInstrument, processor);

        if (!authResult || authResult.error) {
            Transaction.wrap(function() { // eslint-disable-line no-loop-func
                OrderMgr.failOrder(order, true);
            });
            return new Status(Status.ERROR, 'CKO_AUTH_FAILED', Resource.msg('error.payment.not.valid', 'checkout', null));
        }

        if (authResult.redirectUrl) {
            redirectUrl = authResult.redirectUrl;
        }
        if (authResult.mbwayPending || authResult.bizumPending || authResult.achPending) {
            isPending = true;
        }
    }

    Transaction.wrap(function() {
        if (redirectUrl) {
            // The shopper must complete 3DS or the APM page; the gateway return
            // leg (returnHandler) places the order.
            order.custom.ckoRedirectUrl = redirectUrl; // eslint-disable-line no-param-reassign
        } else if (!isPending) {
            // Synchronous success: place and confirm the order
            var placeStatus = OrderMgr.placeOrder(order);
            if (placeStatus.status !== Status.ERROR) {
                order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                order.setExportStatus(Order.EXPORT_STATUS_READY);
            }
        }
        // Async APMs: leave the order created; the webhook-driven
        // payment-status endpoint places it once the shopper approves.
    });

    return new Status(Status.OK);
};

/**
 * Expose the gateway redirect URL on the SCAPI order response.
 * @param {dw.order.Order} order The created order
 * @param {Object} orderResponse The OCAPI order response document
 * @returns {dw.system.Status} The hook status
 */
exports.modifyPOSTResponse = function(order, orderResponse) {
    if (order.custom.ckoRedirectUrl) {
        // eslint-disable-next-line no-param-reassign
        orderResponse.c_ckoRedirectUrl = order.custom.ckoRedirectUrl;
    }
    return new Status(Status.OK);
};
