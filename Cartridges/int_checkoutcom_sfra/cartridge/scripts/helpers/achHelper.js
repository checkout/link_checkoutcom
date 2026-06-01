'use strict';

/**
 * Helper for ACH Direct Debit asynchronous webhook notification storage
 * and Plaid processor token management on the customer Profile.
 *
 * Webhook notifications reuse the shared `webhookNotification` SFCC custom object
 * type (primary key: orderNo) to bridge the server-to-server CKO webhook with
 * the client-side polling loop — the same approach used by MB Way and Bizum.
 *
 * The Plaid processor token is stored on the customer Profile custom attribute
 * `ckoPlaidProcessorToken` so it can be deleted when a bank_account_updated
 * webhook is received (AC18).
 *
 * Required Business Manager setup:
 *   Custom object type : webhookNotification
 *   Attributes         : webhookPayload (Text), webhookType (String)
 *   Profile attribute  : ckoPlaidProcessorToken (String)
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var CUSTOM_OBJECT_TYPE = 'webhookNotification';

var achHelper = {
    /**
     * Persists a CKO webhook payload for a given order in the webhookNotification custom object.
     * Creates the object if it does not yet exist; overwrites if it does.
     *
     * @param {string} orderNo - SFCC order number used as the custom object key
     * @param {Object} hook    - Parsed webhook body from Checkout.com
     */
    storeWebhookNotification: function(orderNo, hook) {
        try {
            Transaction.wrap(function() {
                var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, orderNo);
                if (!obj) {
                    obj = CustomObjectMgr.createCustomObject(CUSTOM_OBJECT_TYPE, orderNo);
                }
                obj.custom.webhookPayload = JSON.stringify(hook);
                obj.custom.webhookType = hook.type;
            });
        } catch (e) {
            Logger.error('achHelper.storeWebhookNotification failed for order {0}: {1}', orderNo, e.message);
        }
    },

    /**
     * Retrieves the stored webhook notification for an order.
     *
     * @param {string} orderNo - SFCC order number
     * @returns {Object|null} Object with webhookType and webhookPayload, or null if not found
     */
    getWebhookNotification: function(orderNo) {
        var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, orderNo);
        if (obj) {
            return {
                webhookType: obj.custom.webhookType,
                webhookPayload: obj.custom.webhookPayload,
            };
        }
        return null;
    },

    /**
     * Removes the webhookNotification custom object for an order (cleanup after processing).
     *
     * @param {string} orderNo - SFCC order number
     */
    deleteWebhookNotification: function(orderNo) {
        try {
            Transaction.wrap(function() {
                var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, orderNo);
                if (obj) {
                    CustomObjectMgr.remove(obj);
                }
            });
        } catch (e) {
            Logger.error('achHelper.deleteWebhookNotification failed for order {0}: {1}', orderNo, e.message);
        }
    },

    /**
     * Saves the Plaid processor token against the customer Profile (AC6b).
     * Only stored for authenticated (registered) customers.
     *
     * @param {dw.customer.Customer} customer     - SFCC Customer object from order.getCustomer()
     * @param {string}               processorToken - Plaid processor token from /processor/token/create
     */
    saveProcessorToken: function(customer, processorToken) {
        if (!customer || !processorToken) { return; }
        try {
            Transaction.wrap(function() {
                var profile = customer.getProfile();
                if (profile) {
                    profile.custom.ckoPlaidProcessorToken = processorToken;
                }
            });
        } catch (e) {
            Logger.error('achHelper.saveProcessorToken failed: {0}', e instanceof Error ? e.message : String(e));
        }
    },

    /**
     * Deletes the Plaid processor token from the customer Profile.
     * Called when a bank_account_updated webhook is received (AC18).
     *
     * @param {dw.customer.Customer} customer - SFCC Customer object from order.getCustomer()
     */
    deleteProcessorToken: function(customer) {
        if (!customer) { return; }
        try {
            Transaction.wrap(function() {
                var profile = customer.getProfile();
                if (profile) {
                    profile.custom.ckoPlaidProcessorToken = null;
                }
            });
        } catch (e) {
            Logger.error('achHelper.deleteProcessorToken failed: {0}', e instanceof Error ? e.message : String(e));
        }
    },
};

module.exports = achHelper;
