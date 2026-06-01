'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/* Utility */
var util = require('*/cartridge/scripts/helpers/ckoHelper');
var constants = require('*/cartridge/config/constants');

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
                var serviceUrl = args.isPayPalApprove ? (svc.configuration.credential.URL + '/' + args.id) : svc.configuration.credential.URL;
                var reqMethod = args.isPayPalApprove ? 'GET' : 'POST';

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
                var serviceUrl = args.isPayPalApprove ? (svc.configuration.credential.URL + '/' + args.id) : svc.configuration.credential.URL;
                var reqMethod = args.isPayPalApprove ? 'GET' : 'POST';

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
