'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger');

var config = require('*/cartridge/scripts/checkoutcom/config');

/**
 * HTTP client for the Checkout.com APIs. Service ids, configured in
 * impex/install/services.xml:
 *
 *   cko.flow.sessions.{mode}.service  POST /payment-sessions
 *   cko.flow.submit.{mode}.service    POST /payment-sessions/{id}/submit
 *   cko.flow.payments.{mode}.service  GET  /payments/{id}
 *   cko.flow.voids.{mode}.service     POST /payments/{id}/voids
 *   cko.flow.refunds.{mode}.service   POST /payments/{id}/refunds
 *
 * {mode} is sandbox or production (the Mode site preference). Credential URLs
 * carry the literal token {id}, replaced at call time; the Service Endpoint site
 * preference, when set, replaces their host.
 */

/** Response fields that must never reach the service communication log. */
var SECRET_FIELDS = /"(payment_session_secret|payment_session_token|session_data)"\s*:\s*"[^"]*"/g;

/**
 * Create the service for a logical API name in the configured mode.
 * @param {string} name The logical name: sessions, submit, payments, voids or refunds
 * @returns {dw.svc.HTTPService} The service
 */
function createService(name) {
    return LocalServiceRegistry.createService('cko.flow.' + name + '.' + config.getMode() + '.service', {
        createRequest: function(svc, args) {
            svc.addHeader('Authorization', 'Bearer ' + config.getSecretKey());
            svc.addHeader('Content-Type', 'application/json;charset=UTF-8');
            svc.addHeader('User-Agent', config.PLATFORM_DATA);

            return args && args.body ? JSON.stringify(args.body) : null;
        },
        parseResponse: function(svc, response) {
            try {
                return JSON.parse(response.text);
            } catch (e) {
                return response.text;
            }
        },
        filterLogMessage: function(message) {
            return String(message).replace(SECRET_FIELDS, '"$1":"****"');
        },
    });
}

/**
 * Call a Checkout.com API.
 * @param {string} name The logical API name
 * @param {Object} options method, id (substituted into the URL) and body
 * @returns {{ok: boolean, object: *, errorMessage: string}} The call result
 */
function call(name, options) {
    var service = createService(name);
    var url = service.getURL();
    var endpoint = config.getServiceEndpoint();

    if (endpoint) {
        url = url.replace(/^https?:\/\/[^/]+/, endpoint);
    }

    if (options.id) {
        url = url.replace('{id}', encodeURIComponent(options.id));
    }

    service.setURL(url);

    service.setRequestMethod(options.method || 'POST');

    var result = service.call({ body: options.body || null });

    if (config.isDebugEnabled()) {
        Logger.getLogger(config.LOG_CATEGORY).info('{0} {1} -> {2}', options.method || 'POST', url, result.isOk() ? 'OK' : 'HTTP ' + result.getError());
    }

    if (result.isOk()) {
        return { ok: true, object: result.getObject(), errorMessage: null };
    }

    return {
        ok: false,
        object: null,
        errorMessage: result.getErrorMessage() || ('HTTP ' + result.getError()),
    };
}

module.exports = {
    /**
     * @param {Object} payload The payment session request
     * @returns {Object} The call result; object is the payment session
     */
    createPaymentSession: function(payload) {
        return call('sessions', { method: 'POST', body: payload });
    },

    /**
     * Submit the payment collected by Flow (used from its handleSubmit callback).
     * @param {string} sessionId The payment session id (ps_...)
     * @param {Object} payload session_data plus the amount, reference and items to charge
     * @returns {Object} The call result; object is returned to Flow unmodified
     */
    submitPaymentSession: function(sessionId, payload) {
        return call('submit', { method: 'POST', id: sessionId, body: payload });
    },

    /**
     * @param {string} paymentId The payment id (pay_...)
     * @returns {Object} The call result; object is the payment
     */
    getPayment: function(paymentId) {
        return call('payments', { method: 'GET', id: paymentId });
    },

    /**
     * @param {string} paymentId The payment id
     * @param {string} reference A reference for the void
     * @returns {Object} The call result
     */
    voidPayment: function(paymentId, reference) {
        return call('voids', { method: 'POST', id: paymentId, body: { reference: reference } });
    },

    /**
     * @param {string} paymentId The payment id
     * @param {string} reference A reference for the refund
     * @returns {Object} The call result
     */
    refundPayment: function(paymentId, reference) {
        return call('refunds', { method: 'POST', id: paymentId, body: { reference: reference } });
    },
};
