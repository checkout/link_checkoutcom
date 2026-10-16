'use strict';

/* Server */
var server = require('server');

/* API Includes */
var Logger = require('dw/system/Logger');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');

/* Middleware */
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var paymentHelper = require('*/cartridge/scripts/helpers/paymentHelper');
var flowHelper = require('*/cartridge/scripts/helpers/flowHelper');
var flowPaymentHelper = require('*/cartridge/scripts/helpers/flowPaymentHelper');

/**
 * Checkout.com Flow controller.
 *
 * Renders the Checkout Web Components (Flow) payment page for an order created by
 * the standard SFRA place order route, and settles the order once the gateway
 * confirms the payment.
 *
 * Route overview:
 *   Show         - renders Flow for the order reserved in the shopper session
 *   Complete     - AJAX settlement, called from the onPaymentCompleted callback
 *   HandleReturn - success_url, used by the payment methods that redirect offsite
 *   HandleFail   - failure_url, and the shopper facing "cancel" target
 */

/**
 * Read the payment id out of a gateway redirect.
 * Flow returns cko-payment-id for completed payments; the session id is accepted
 * as a fallback because some payment methods only append that.
 * @param {Object} querystring The request query string
 * @returns {string|null} The payment id, or null when none is present
 */
function getReturnedPaymentId(querystring) {
    var keys = ['cko-payment-id', 'cko-session-id', 'cko-payment-session-id'];
    var found = null;

    keys.forEach(function(key) {
        if (!found && querystring[key]) {
            found = querystring[key];
        }
    });

    return found;
}

/**
 * Build the JSON payload that sends the shopper back to the payment step after a
 * Flow payment could not be settled.
 * @returns {Object} The error response payload
 */
function getPaymentErrorPayload() {
    return {
        error: true,
        errorMessage: ckoHelper.getPaymentFailureMessage(),
        redirectUrl: URLUtils.url(
            'Checkout-Begin',
            'stage',
            'payment',
            'paymentError',
            Resource.msg('error.payment.not.valid', 'checkout', null)
        ).toString(),
    };
}

/**
 * Renders the Flow payment page for the order currently being paid for.
 */
server.get('Show', server.middleware.https, csrfProtection.generateToken, function(req, res, next) {
    var order = flowPaymentHelper.getSessionOrder(req.querystring.ref);

    if (!order) {
        Logger.getLogger('checkoutcom').warn(
            'Flow page requested for an order that is not valid for this session.'
        );
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    if (!flowHelper.isEnabled()) {
        flowPaymentHelper.failOrder(order);
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    var sessionResult = flowHelper.createPaymentSession(order);

    if (sessionResult.error) {
        flowPaymentHelper.failOrder(order);
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    // eslint-disable-next-line no-undef
    session.privacy.ckoFlowSessionId = sessionResult.session.id;

    res.render('checkout/flow/flowPayment', {
        ckoFlow: flowHelper.getViewData(order, sessionResult.session),
    });

    return next();
});

/**
 * Settles the order after the Flow component reports a completed payment.
 * Called over AJAX from the onPaymentCompleted callback.
 */
server.post('Complete', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    var order = flowPaymentHelper.getSessionOrder(req.form.orderNo);

    if (!order) {
        res.json(getPaymentErrorPayload());

        return next();
    }

    var result = flowPaymentHelper.completeOrder(order, req.form.paymentId);

    if (result.error) {
        flowPaymentHelper.clearSession();

        res.json(getPaymentErrorPayload());

        return next();
    }

    flowPaymentHelper.sendConfirmationEmail(order, req.locale.id);
    flowPaymentHelper.clearSession();
    req.session.privacyCache.set('usingMultiShipping', false);

    res.json({
        error: false,
        redirectUrl: URLUtils.url(
            'Order-Confirm',
            'ID',
            order.getOrderNo(),
            'token',
            order.getOrderToken()
        ).toString(),
    });

    return next();
});

/**
 * Handles the gateway success_url for the Flow payment methods that take the
 * shopper offsite, such as iDEAL, Klarna or Multibanco.
 */
server.get('HandleReturn', server.middleware.https, function(req, res, next) {
    var paymentId = getReturnedPaymentId(req.querystring);
    var resolved = paymentId
        ? flowPaymentHelper.resolveReturnOrder(paymentId)
        : { order: null, payment: null };
    var order = resolved.order;

    if (!order) {
        Logger.getLogger('checkoutcom').warn(
            'Flow return received without a resolvable order or payment id.'
        );
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    var result = flowPaymentHelper.completeOrder(order, paymentId, resolved.payment);

    if (result.error) {
        flowPaymentHelper.clearSession();
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    flowPaymentHelper.sendConfirmationEmail(order, req.locale.id);
    flowPaymentHelper.clearSession();
    req.session.privacyCache.set('usingMultiShipping', false);

    paymentHelper.getConfirmationPageRedirect(res, order);

    return next();
});

/**
 * Handles the gateway failure_url, and the shopper choosing to go back to
 * checkout from the Flow page. The order is failed and the basket restored so
 * the shopper can pick a different payment method.
 */
server.get('HandleFail', server.middleware.https, function(req, res, next) {
    // eslint-disable-next-line no-undef
    var orderNo = req.querystring.ref || session.privacy.ckoFlowOrderNo;
    var order = flowPaymentHelper.getSessionOrder(orderNo);

    if (order) {
        flowPaymentHelper.failOrder(order);
    }

    flowPaymentHelper.clearSession();
    paymentHelper.getFailurePageRedirect(res);

    return next();
});

module.exports = server.exports();
