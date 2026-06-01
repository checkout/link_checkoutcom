'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/**
 * Plaid HTTP service wrapper for ACH Direct Debit.
 * The Plaid endpoint path is appended to the credential base URL via args.endpoint
 * (e.g. '/link/token/create', '/item/public_token/exchange', '/processor/token/create').
 * The request body is passed as args.body and serialized as JSON.
 */
var wrapper = {
    /**
     * Initialize HTTP service for the Plaid sandbox environment.
     * @returns {Object} The service instance
     */
    sandbox: function() {
        return LocalServiceRegistry.createService('cko.plaid.sandbox.service', {
            createRequest: function(svc, args) {
                svc.setURL(svc.getURL() + args.endpoint);
                svc.setRequestMethod('POST');
                svc.addHeader('Content-Type', 'application/json');
                return JSON.stringify(args.body);
            },

            parseResponse: function(svc, resp) {
                return {
                    statusCode: resp.statusCode,
                    text: resp.text,
                };
            },

            getRequestLogMessage: function(request) {
                return request;
            },

            getResponseLogMessage: function(response) {
                return response.text;
            },
        });
    },

    /**
     * Initialize HTTP service for the Plaid production environment.
     * @returns {Object} The service instance
     */
    live: function() {
        return LocalServiceRegistry.createService('cko.plaid.live.service', {
            createRequest: function(svc, args) {
                svc.setURL(svc.getURL() + args.endpoint);
                svc.setRequestMethod('POST');
                svc.addHeader('Content-Type', 'application/json');
                return JSON.stringify(args.body);
            },

            parseResponse: function(svc, resp) {
                return {
                    statusCode: resp.statusCode,
                    text: resp.text,
                };
            },

            getRequestLogMessage: function(request) {
                return request;
            },

            getResponseLogMessage: function(response) {
                return response.text;
            },
        });
    },
};

/**
 * Module exports
 */
module.exports = wrapper;
