'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/* Utility */
var util = require('*/cartridge/scripts/helpers/ckoHelper');

var wrapper = {
    /**
     * Initialize HTTP service for the Checkout.com sandbox network token.
     * @returns {Object} The service instance
     */
    sandbox: function() {
        return LocalServiceRegistry.createService('cko.network.token.sandbox.service', {
            createRequest: function(svc, args) {
                // Prepare the http service
                svc.addHeader('Authorization', util.getAccountKeys().publicKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

                return (args) || null;
            },

            parseResponse: function(svc, resp) {
                return JSON.parse(resp.text);
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
     * Initialize HTTP service for the Checkout.com live network token.
     * @returns {Object} The service instance
     */
    live: function() {
        return LocalServiceRegistry.createService('cko.network.token.live.service', {
            createRequest: function(svc, args) {
                // Prepare the http service
                svc.addHeader('Authorization', util.getAccountKeys().publicKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

                return (args) || null;
            },

            parseResponse: function(svc, resp) {
                return JSON.parse(resp.text);
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
