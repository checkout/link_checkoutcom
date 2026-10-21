'use strict';

/* Server */
var server = require('server');

/* API Includes */
var CSRFProtection = require('dw/web/CSRFProtection');
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
 *   Session      - same payment session as Show, as JSON, so the checkout page can
 *                  mount Flow inline in the place order step
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
 * The payload for a payment that could not be confirmed (Checkout.com
 * unreachable): never a decline, the shopper must not pay again.
 * @returns {Object} The error response payload
 */
function getPaymentUnverifiedPayload() {
    var message = Resource.msg('cko.payment.unverified', 'cko', null);

    return {
        error: true,
        errorMessage: message,
        redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'paymentError', message).toString(),
    };
}

/**
 * Finish a settled Flow order: the confirmation email (only for the request
 * that placed it) and the session clean-up.
 * @param {Object} req The request
 * @param {Object} result The completeOrder result
 */
function finishOrder(req, result) {
    if (!result.alreadyPlaced) {
        flowPaymentHelper.sendConfirmationEmail(result.order, req.locale.id);
    }

    flowPaymentHelper.clearSession();
    req.session.privacyCache.set('usingMultiShipping', false);
}

/**
 * Create the Flow payment session for an order reserved in the shopper session.
 * Shared by Show and Session so the page and the inline mount behave the same.
 * The order is failed, and the basket restored, when it cannot be paid for.
 * @param {string} orderNo The order number the shopper is paying for
 * @param {string} routeName The calling route, for the log message
 * @returns {Object|null} The order and payment session, or null on failure
 */
function startPaymentSession(orderNo, routeName) {
    var order = flowPaymentHelper.getSessionOrder(orderNo);

    if (!order) {
        Logger.getLogger('checkoutcom').warn(
            'Flow {0} requested for an order that is not valid for this session.',
            routeName
        );

        return null;
    }

    if (!flowHelper.isEnabled()) {
        flowPaymentHelper.failOrder(order);

        return null;
    }

    var sessionResult = flowHelper.createPaymentSession(order);

    if (sessionResult.error) {
        flowPaymentHelper.failOrder(order);

        return null;
    }

    // eslint-disable-next-line no-undef
    session.privacy.ckoFlowSessionId = sessionResult.session.id;

    return { order: order, session: sessionResult.session };
}

/**
 * Renders the Flow payment page for the order currently being paid for.
 */
server.get('Show', server.middleware.https, csrfProtection.generateToken, function(req, res, next) {
    var started = startPaymentSession(req.querystring.ref, 'Show');

    if (!started) {
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    res.render('checkout/flow/flowPayment', {
        ckoFlow: flowHelper.getViewData(started.order, started.session),
    });

    return next();
});

/**
 * Returns the Flow payment session as JSON so the checkout page can mount Flow
 * inline in the place order step, instead of redirecting to Show. Called over
 * AJAX right after CheckoutServices-PlaceOrder has created the order.
 */
server.post('Session', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    var started = startPaymentSession(req.querystring.ref, 'Session');

    if (!started) {
        res.json(getPaymentErrorPayload());

        return next();
    }

    var viewData = flowHelper.getViewData(started.order, started.session);

    // A fresh token for the CKOFlow-Complete call that settles the order
    viewData.csrfName = CSRFProtection.getTokenName();
    viewData.csrfToken = CSRFProtection.generateToken();
    viewData.title = Resource.msg('cko.flow.page.title', 'cko', null);
    viewData.cancelLabel = Resource.msg('cko.flow.cancel', 'cko', null);
    viewData.genericError = Resource.msg('cko.flow.error.generic', 'cko', null);
    viewData.loadError = Resource.msg('cko.flow.error.unavailable', 'cko', null);

    res.json({
        error: false,
        ckoFlow: viewData,
    });

    return next();
});

/**
 * Settles the order after the Flow component reports a completed payment.
 * Called over AJAX from the onPaymentCompleted callback.
 */
server.post('Complete', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    var order = flowPaymentHelper.getSessionOrder(req.form.orderNo);
    var result;

    if (order) {
        result = flowPaymentHelper.completeOrder(order, req.form.paymentId);
    } else {
        // eslint-disable-next-line no-undef
        var placed = req.form.orderNo === session.privacy.ckoFlowOrderNo
            ? flowPaymentHelper.getPlacedFlowOrder(req.form.orderNo)
            : null;

        // HandleReturn (or a refresh) placed it first: the same confirmation
        result = placed ? { error: false, alreadyPlaced: true, order: placed } : { error: true };
    }

    if (result.error) {
        if (result.unverified) {
            // Kept open: checked again by the abandoned-order check
            res.json(getPaymentUnverifiedPayload());

            return next();
        }

        flowPaymentHelper.clearSession();

        res.json(getPaymentErrorPayload());

        return next();
    }

    finishOrder(req, result);

    res.json({
        error: false,
        redirectUrl: URLUtils.url(
            'Order-Confirm',
            'ID',
            result.order.getOrderNo(),
            'token',
            result.order.getOrderToken()
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
    var result;

    if (order) {
        result = flowPaymentHelper.completeOrder(order, paymentId, resolved.payment);
    } else {
        // Placed first by Complete (or an earlier visit of this URL)
        var placed = resolved.payment ? flowPaymentHelper.getPlacedFlowOrder(resolved.payment.reference) : null;

        result = placed ? flowPaymentHelper.settlePlacedOrder(placed, resolved.payment) : null;
    }

    if (!result) {
        Logger.getLogger('checkoutcom').warn(
            'Flow return received without a resolvable order or payment id.'
        );

        if (paymentId && !resolved.payment) {
            // The payment could not be read back: not a decline
            paymentHelper.getUnverifiedPageRedirect(res);
        } else {
            paymentHelper.getFailurePageRedirect(res);
        }

        return next();
    }

    if (result.error) {
        if (result.unverified) {
            paymentHelper.getUnverifiedPageRedirect(res);

            return next();
        }

        flowPaymentHelper.clearSession();
        paymentHelper.getFailurePageRedirect(res);

        return next();
    }

    finishOrder(req, result);

    paymentHelper.getConfirmationPageRedirect(res, result.order);

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

    // The failure URL (or going back) proves nothing about the payment: a
    // payment that went through completes the order instead of failing it
    var released = order ? flowPaymentHelper.releaseOrder(order) : { status: 'failed' };

    if (released.status === 'complete') {
        finishOrder(req, { order: released.order, alreadyPlaced: released.alreadyPlaced });
        paymentHelper.getConfirmationPageRedirect(res, released.order);

        return next();
    }

    if (released.status === 'unverified') {
        paymentHelper.getUnverifiedPageRedirect(res);

        return next();
    }

    flowPaymentHelper.clearSession();
    paymentHelper.getFailurePageRedirect(res);

    return next();
});

module.exports = server.exports();
