'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');

var config = require('*/cartridge/scripts/checkoutcom/config');

/**
 * Order lookups.
 *
 * Shopper requests (the Custom API) run with the shopper's SLAS token, so the
 * global `customer` is the shopper; every order number arriving from the
 * storefront is checked against it, so a shopper can never pay for, complete or
 * fail somebody else's order.
 *
 * Webhooks arrive with no shopper session. With the Limit Storefront Order
 * Access site preference enabled (the default on new sites), such a request may
 * only load an order with OrderMgr.getOrder(orderNo, orderToken); the search
 * methods are restricted too. So every payment is bound to its order, number and
 * token, in a ckoPayment custom object when it is submitted or applied.
 */

var BINDING_TYPE = 'ckoPayment';

/* global customer */

/**
 * @param {dw.order.Order} order The order
 * @returns {boolean} True when the order belongs to the calling shopper
 */
function isShopperOrder(order) {
    var orderCustomer = order.getCustomer();

    var shopper = typeof customer !== 'undefined' ? customer : null;

    return !!(orderCustomer && shopper && orderCustomer.getID() === shopper.getID());
}

module.exports = {
    isShopperOrder: isShopperOrder,

    /**
     * Load an order of the calling shopper.
     * @param {string} orderNo The order number
     * @returns {dw.order.Order|null} The order, or null when missing or not the shopper's
     */
    getShopperOrder: function(orderNo) {
        if (!orderNo) {
            return null;
        }

        var order = OrderMgr.getOrder(orderNo);

        return order && isShopperOrder(order) ? order : null;
    },

    /**
     * Bind a payment to its order. Idempotent; must run inside a Transaction.
     * @param {string} paymentId The Checkout.com payment id
     * @param {dw.order.Order} order The order the payment is for
     */
    bindPayment: function(paymentId, order) {
        var binding = CustomObjectMgr.getCustomObject(BINDING_TYPE, paymentId)
            || CustomObjectMgr.createCustomObject(BINDING_TYPE, paymentId);

        binding.custom.orderNo = order.getOrderNo();
        binding.custom.orderToken = order.getOrderToken();
    },

    /**
     * @param {string} paymentId The Checkout.com payment id
     * @returns {string|null} The number of the order the payment is bound to
     */
    getBoundOrderNo: function(paymentId) {
        var binding = paymentId ? CustomObjectMgr.getCustomObject(BINDING_TYPE, paymentId) : null;

        return binding ? binding.custom.orderNo : null;
    },

    /**
     * Load the order a payment is bound to. Works without a shopper session.
     * @param {string} paymentId The Checkout.com payment id
     * @returns {dw.order.Order|null} The order
     */
    getBoundOrder: function(paymentId) {
        var binding = paymentId ? CustomObjectMgr.getCustomObject(BINDING_TYPE, paymentId) : null;

        return binding ? OrderMgr.getOrder(binding.custom.orderNo, binding.custom.orderToken) : null;
    },

    /**
     * @param {dw.order.Order} order The order
     * @returns {boolean} True when the order still waits for its payment
     */
    isAwaitingPayment: function(order) {
        return order.getStatus().getValue() === Order.ORDER_STATUS_CREATED
            && order.getPaymentInstruments(config.PAYMENT_METHOD_ID).size() > 0;
    },

    /**
     * @param {dw.order.Order} order The order
     * @returns {boolean} True when the order has been placed
     */
    isPlaced: function(order) {
        var status = order.getStatus().getValue();

        return status === Order.ORDER_STATUS_NEW
            || status === Order.ORDER_STATUS_OPEN
            || status === Order.ORDER_STATUS_COMPLETED;
    },
};
