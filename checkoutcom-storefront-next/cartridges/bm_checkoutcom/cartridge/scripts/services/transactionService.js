'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/* Utility */
var util = require('*/cartridge/scripts/helpers/CKOHelper');

/**
 * HTTP services for the Business Manager capture, refund and void actions.
 *
 * Service ids follow cko.transaction.{action}.{mode}.service, where mode is the
 * ckoMode site preference (sandbox or production); CKOHelper.getService() picks
 * the wrapper by that mode.
 * @param {string} action capture, refund or void
 * @returns {Object} Wrappers keyed by mode, each creating the service
 */
function forAction(action) {
    var create = function(mode) {
        return LocalServiceRegistry.createService('cko.transaction.' + action + '.' + mode + '.service', {
            createRequest: function(svc, args) {
                svc.addHeader('Authorization', 'Bearer ' + util.getAccountKeys().secretKey);
                svc.addHeader('User-Agent', util.getCartridgeMeta());
                svc.addHeader('Content-Type', 'application/json;charset=UTF-8');

                return args ? JSON.stringify(args) : null;
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
    };

    return {
        sandbox: function() {
            return create('sandbox');
        },
        production: function() {
            return create('production');
        },
    };
}

module.exports = { forAction: forAction };
