'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/* Utility */
var util = require('*/cartridge/scripts/helpers/CKOHelper');

var wrapper = {
    /**
     * Initialize HTTP service for the Checkout.com sandbox full card capture.
     * @returns {string} returns the http response
     */
    sandbox: function() {
        return LocalServiceRegistry.createService('cko.transaction.capture.sandbox.service', {
            createRequest: function(svc, args) {
                // Prepare the http service
                // The args.service will hold the value of order.custom.orderProcessedByABCorNAS
                // to handle Capture, Refund, or Void actions on historical orders based on the order's custom attribute.
                svc.addHeader('Authorization', util.getAccountKeys(args ? args.service : '').secretKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

                // eslint-disable-next-line no-param-reassign
                delete args.service;
                return (args) ? JSON.stringify(args) : null;
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
     * Initialize HTTP service for the Checkout.com live full card capture.
     * @returns {string} returns the http response
     */
    live: function() {
        return LocalServiceRegistry.createService('cko.transaction.capture.live.service', {
            // eslint-disable-next-line no-shadow
            createRequest: function(svc, args) {
                // Prepare the http service
                // The args.service will hold the value of order.custom.orderProcessedByABCorNAS
                // to handle Capture, Refund, or Void actions on historical orders based on the order's custom attribute.
                svc.addHeader('Authorization', util.getAccountKeys(args ? args.service : '').secretKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

                // eslint-disable-next-line no-param-reassign
                delete args.service;
                return (args) ? JSON.stringify(args) : null;
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

/*
* Module exports
*/
module.exports = wrapper;
