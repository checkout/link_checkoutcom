'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/* Utility */
var util = require('*/cartridge/scripts/helpers/ckoHelper');
var constants = require('*/cartridge/config/constants');

/**
 * Validates payment context ID format to prevent path traversal attacks.
 * Payment context IDs should match the format: pct_<alphanumeric>
 * @param {string} id The payment context ID to validate
 * @returns {boolean} true if valid, false otherwise
 */
function validatePaymentContextId(id) {
    if (!id || typeof id !== 'string') {
        return false;
    }
    // Payment context IDs follow the format: pct_[A-Za-z0-9]+
    return /^pct_[A-Za-z0-9_]+$/.test(id);
}

/**
 * Transaction service wrapper.
 */
var wrapper = {
    /**
     * Initialize HTTP service for the Checkout.com to get order id.
     * @param {string} serviceId Service Id
     * @returns {Object} The service instance
     */
    sandbox: function(serviceId) {
        return LocalServiceRegistry.createService(serviceId, {
            createRequest: function(svc, args) {
                var serviceUrl = svc.configuration.credential.URL;
                var reqMethod = 'POST';

                // Handle PayPal Approve requests with strict validation
                if (args.isPayPalApprove) {
                    if (!validatePaymentContextId(args.id)) {
                        throw new Error('Invalid payment context ID format');
                    }
                    // Validated above; encoded as a path segment all the same
                    serviceUrl = svc.configuration.credential.URL + '/' + encodeURIComponent(args.id);
                    reqMethod = 'GET';
                }

                // Route to the configured Service Endpoint when present and valid;
                // otherwise leave the default service credentials URL in place.
                var serviceEndpoint = util.getServiceEndpoint();
                if (serviceEndpoint) {
                    serviceUrl = serviceUrl.replace(constants.CKO_END_POINTS, serviceEndpoint);
                }

                // Prepare the http service
                svc.setURL(serviceUrl);
                svc.setRequestMethod(reqMethod);
                svc.addHeader('Authorization', util.getAccountKeys().secretKey);
                svc.addHeader('Content-Type', 'application/json');

                return (args) ? JSON.stringify(args) : null;
            },

            parseResponse: function(svc, resp) {
                return JSON.parse(resp.text);
            },

            getRequestLogMessage: function(request) {
                return util.redactServiceLog(request);
            },

            getResponseLogMessage: function(response) {
                return util.redactServiceLog(response.text);
            },
        });
    },

    /**
     * Initialize HTTP service for the Checkout.com to get order id.
     * @param {string} serviceId Service Id
     * @returns {Object} The service instance
     */
    live: function(serviceId) {
        return LocalServiceRegistry.createService(serviceId, {
            createRequest: function(svc, args) {
                var serviceUrl = svc.configuration.credential.URL;
                var reqMethod = 'POST';

                // Handle PayPal Approve requests with strict validation
                if (args.isPayPalApprove) {
                    if (!validatePaymentContextId(args.id)) {
                        throw new Error('Invalid payment context ID format');
                    }
                    // Validated above; encoded as a path segment all the same
                    serviceUrl = svc.configuration.credential.URL + '/' + encodeURIComponent(args.id);
                    reqMethod = 'GET';
                }

                // Route to the configured Service Endpoint when present and valid;
                // otherwise leave the default service credentials URL in place.
                var serviceEndpoint = util.getServiceEndpoint();
                if (serviceEndpoint) {
                    serviceUrl = serviceUrl.replace(constants.CKO_END_POINTS, serviceEndpoint);
                }

                // Prepare the http service
                svc.setURL(serviceUrl);
                svc.setRequestMethod(reqMethod);
                svc.addHeader('Authorization', util.getAccountKeys().secretKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

                return args;
            },

            parseResponse: function(svc, resp) {
                return JSON.parse(resp.text);
            },

            getRequestLogMessage: function(request) {
                return util.redactServiceLog(request);
            },

            getResponseLogMessage: function(response) {
                return util.redactServiceLog(response.text);
            },
        });
    },
};

/**
 * Module exports
 */
module.exports = wrapper;
