'use strict';

/**
 * Implementation of the Checkout.com Flow Custom API (see schema.yaml).
 */

var RESTResponseMgr = require('dw/system/RESTResponseMgr');

/**
 * POST /payment-sessions
 * Create a payment session for the shopper's current basket.
 */
exports.createPaymentSession = function() {
    var BasketMgr = require('dw/order/BasketMgr');
    var sessionHelper = require('*/cartridge/scripts/flow/sessionHelper');

    var basket = BasketMgr.getCurrentBasket();
    if (!basket || basket.getProductLineItems().isEmpty()) {
        RESTResponseMgr.createError(404, 'basket-not-found', 'Basket Not Found', 'The shopper has no basket with items.').render();
        return;
    }

    var result = sessionHelper.createSession(basket);
    if (!result.ok) {
        RESTResponseMgr.createError(422, 'session-creation-failed', 'Payment Session Creation Failed', result.errorMessage).render();
        return;
    }

    RESTResponseMgr.createSuccess(result.session).render();
};
exports.createPaymentSession.public = true;

/**
 * POST /complete
 * Verify the payment and place the order (idempotent; poll while pending).
 */
exports.completePayment = function() {
    var completionHelper = require('*/cartridge/scripts/flow/completionHelper');

    var body;
    try {
        // eslint-disable-next-line no-undef
        body = JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (e) {
        body = null;
    }
    if (!body || !body.paymentId) {
        RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', 'paymentId is required.').render();
        return;
    }

    var result = completionHelper.completePayment(body.paymentId);
    RESTResponseMgr.createSuccess({
        status: result.status,
        orderNo: result.orderNo || null,
        orderToken: result.orderToken || null,
        errorMessage: result.errorMessage || null,
    }).render();
};
exports.completePayment.public = true;
