'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/* Utility */
var util = require('*/cartridge/scripts/helpers/ckoHelper');
var constants = require('*/cartridge/config/constants');

/**
 * Checkout.com Flow payment session service wrapper.
 *
 * Wraps POST /payment-sessions, the call that returns the payment session the
 * Checkout Web Components (Flow) bundle is initialised with on the storefront.
 */
var wrapper = {
    /**
     * Initialize the HTTP service for the Checkout.com sandbox payment sessions.
     * @param {string} serviceId Service Id
     * @returns {Object} The service instance
     */
    sandbox: function(serviceId) {
        return LocalServiceRegistry.createService(serviceId, {
            createRequest: function(svc, args) {
                var serviceUrl = svc.configuration.credential.URL;

                // Route to the configured Service Endpoint when present and valid;
                // otherwise leave the default service credentials URL in place.
                var serviceEndpoint = util.getServiceEndpoint();
                if (serviceEndpoint) {
                    serviceUrl = serviceUrl.replace(constants.CKO_END_POINTS, serviceEndpoint);
                }

                // Prepare the http service
                svc.setURL(serviceUrl);
                svc.setRequestMethod('POST');
                svc.addHeader('Authorization', util.getAccountKeys().secretKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

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
     * Initialize the HTTP service for the Checkout.com live payment sessions.
     * @param {string} serviceId Service Id
     * @returns {Object} The service instance
     */
    live: function(serviceId) {
        return LocalServiceRegistry.createService(serviceId, {
            createRequest: function(svc, args) {
                var serviceUrl = svc.configuration.credential.URL;

                // Route to the configured Service Endpoint when present and valid;
                // otherwise leave the default service credentials URL in place.
                var serviceEndpoint = util.getServiceEndpoint();
                if (serviceEndpoint) {
                    serviceUrl = serviceUrl.replace(constants.CKO_END_POINTS, serviceEndpoint);
                }

                // Prepare the http service
                svc.setURL(serviceUrl);
                svc.setRequestMethod('POST');
                svc.addHeader('Authorization', util.getAccountKeys().secretKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

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
};

/**
 * Module exports
 */
module.exports = wrapper;
