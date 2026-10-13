'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

var flowConfig = require('*/cartridge/scripts/flow/flowConfig');

/**
 * HTTP client for the Checkout.com APIs used by the Flow integration.
 * Service ids (configured via services.xml):
 *   cko.flow.sessions.{sandbox|live}.service  -> POST /payment-sessions
 *   cko.flow.payments.{sandbox|live}.service  -> GET  /payments/{paymentId}
 *   cko.flow.voids.{sandbox|live}.service     -> POST /payments/{paymentId}/voids
 *   cko.flow.refunds.{sandbox|live}.service   -> POST /payments/{paymentId}/refunds
 * The credential URLs contain the literal token 'paymentId' which is replaced
 * at call time.
 */

/**
 * Create the service instance.
 * @param {string} serviceId The full service id
 * @returns {dw.svc.Service} The service
 */
function createService(serviceId) {
    return LocalServiceRegistry.createService(serviceId, {
        createRequest: function(svc, args) {
            svc.addHeader('Authorization', 'Bearer ' + flowConfig.getSecretKey());
            svc.addHeader('Content-Type', 'application/json;charset=UTF-8');
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
            // Session secrets and tokens must never reach the logs
            return String(message).replace(/"payment_session_secret"\s*:\s*"[^"]*"/g, '"payment_session_secret":"****"');
        },
    });
}

/**
 * Execute a service call.
 * @param {string} name Logical service name ('sessions'|'payments'|'voids'|'refunds')
 * @param {Object} options Call options: method, paymentId, body
 * @returns {Object} Result: {ok, status, object|errorMessage}
 */
function call(name, options) {
    var serviceId = 'cko.flow.' + name + '.' + flowConfig.getMode() + '.service';
    var service = createService(serviceId);

    if (options && options.paymentId) {
        service.setURL(service.getURL().replace('paymentId', options.paymentId));
    }
    service.setRequestMethod((options && options.method) || 'POST');

    var result = service.call({ body: options ? options.body : null });
    if (result.status === 'OK') {
        return { ok: true, object: result.object };
    }
    return {
        ok: false,
        status: result.error,
        errorMessage: result.errorMessage,
    };
}

module.exports = {
    /**
     * Create a payment session.
     * @param {Object} payload The payment-session request payload
     * @returns {Object} Call result
     */
    createPaymentSession: function(payload) {
        return call('sessions', { method: 'POST', body: payload });
    },

    /**
     * Retrieve payment details for verification.
     * @param {string} paymentId The payment id (pay_...)
     * @returns {Object} Call result
     */
    getPayment: function(paymentId) {
        return call('payments', { method: 'GET', paymentId: paymentId });
    },

    /**
     * Void an authorized payment.
     * @param {string} paymentId The payment id
     * @param {string} reference The void reference
     * @returns {Object} Call result
     */
    voidPayment: function(paymentId, reference) {
        return call('voids', { method: 'POST', paymentId: paymentId, body: { reference: reference } });
    },

    /**
     * Refund a captured payment.
     * @param {string} paymentId The payment id
     * @param {string} reference The refund reference
     * @returns {Object} Call result
     */
    refundPayment: function(paymentId, reference) {
        return call('refunds', { method: 'POST', paymentId: paymentId, body: { reference: reference } });
    },
};
