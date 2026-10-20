'use strict';

/**
 * Implementation of the checkoutcom Custom API (see schema.yaml). Each export
 * is the operationId of an endpoint and must be marked public.
 */

/* global request */

var RESTResponseMgr = require('dw/system/RESTResponseMgr');

/**
 * @returns {Object|null} The parsed JSON request body
 */
function readBody() {
    try {
        return JSON.parse(request.getHttpParameterMap().getRequestBodyAsString()) || {};
    } catch (e) {
        return null;
    }
}

/**
 * Render a 400 for a missing or malformed body.
 * @param {string} detail What is missing
 */
function invalidRequest(detail) {
    RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', detail).render();
}

/**
 * Render a checkout operation result.
 * @param {Object} result The result: ok plus fields, or errorMessage
 * @param {Function} toBody Maps a successful result to the response body
 */
function render(result, toBody) {
    if (!result.ok) {
        RESTResponseMgr.createError(422, 'checkoutcom-error', 'Checkout.com Error', result.errorMessage).render();

        return;
    }

    RESTResponseMgr.createSuccess(toBody(result)).render();
}

/**
 * POST /payment-sessions
 */
exports.createPaymentSession = function() {
    var body = readBody();

    if (!body || !body.successUrl || !body.failureUrl) {
        invalidRequest('successUrl and failureUrl are required.');

        return;
    }

    render(require('*/cartridge/scripts/checkoutcom/checkout').createSession(body), function(result) {
        return {
            paymentSession: result.paymentSession,
            publicKey: result.publicKey,
            environment: result.environment,
            appearance: result.appearance,
            componentOptions: result.componentOptions,
            translations: result.translations,
        };
    });
};
exports.createPaymentSession.public = true;

/**
 * POST /payments/submit
 */
exports.submitPayment = function() {
    var body = readBody();

    if (!body || !body.sessionId || !body.sessionData || !body.orderNo) {
        invalidRequest('sessionId, sessionData and orderNo are required.');

        return;
    }

    render(require('*/cartridge/scripts/checkoutcom/checkout').submitPayment(body), function(result) {
        return result.response;
    });
};
exports.submitPayment.public = true;

/**
 * POST /payments/complete
 */
exports.completePayment = function() {
    var body = readBody();

    if (!body || !body.paymentId) {
        invalidRequest('paymentId is required.');

        return;
    }

    render(require('*/cartridge/scripts/checkoutcom/checkout').completePayment(body), function(result) {
        return {
            status: result.status,
            pending: result.pending === true,
            orderNo: result.orderNo || null,
            orderToken: result.orderToken || null,
            errorMessage: result.errorMessage || null,
        };
    });
};
exports.completePayment.public = true;
