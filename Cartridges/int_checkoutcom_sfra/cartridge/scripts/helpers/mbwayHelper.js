'use strict';

/**
 * Helper for MB WAY asynchronous webhook notification storage.
 *
 * Uses the `webhookNotification` SFCC custom object type (primary key: orderNo)
 * to bridge the server-to-server CKO webhook with the client-side polling loop.
 * This same custom object type is reused by Bizum.
 *
 * Required Business Manager setup:
 *   Object type: webhookNotification
 *   Attributes:  webhookPayload (Text), webhookType (String)
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var CUSTOM_OBJECT_TYPE = 'webhookNotification';

var mbwayHelper = {
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
            Logger.error('mbwayHelper.storeWebhookNotification failed for order {0}: {1}', orderNo, e.message);
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
            Logger.error('mbwayHelper.deleteWebhookNotification failed for order {0}: {1}', orderNo, e.message);
        }
    },
};

module.exports = mbwayHelper;
