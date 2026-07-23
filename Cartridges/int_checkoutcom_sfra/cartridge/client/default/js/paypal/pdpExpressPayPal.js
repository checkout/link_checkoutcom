
'use strict';

var paymentContextID;
var expressPaypal = require('./expressPaypal');
var base = require('../product/base');

/**
 * Delete old basket records and create new basket with ckoProductID data
 * @return {Object} - response
 */
function createBasketFromPDP() {
    var csrfToken = $('input[name="csrf_token"]').val();
    var $productContainer = $('[id="ckoProductID"]').closest('.product-detail');
    var options = base.getOptions($productContainer) || [];
    var response = {
        success: false,
        error: true,
    };
    $.ajax({
        url: document.getElementById('ckoCreateBasketForPDP').value,
        async: false,
        data: {
            pid: jQuery('[id="ckoProductID"]').val(),
            options: options,
            csrf_token: csrfToken,
        },
        method: 'POST',
        success: function(e) {
            response = e;
        },
        error: function() {
            // request failed — response stays null and is handled by the caller
        },
    });
    return response;
}

/**
 * Calls PayPal express Create Order API Route
 * @return {Object} - order_id returned from api response
 */
function createOrder() {
    var response = createBasketFromPDP();
    if (response && !response.error && response.success) {
        var paymentContext = expressPaypal.createPayPalOrder();
        paymentContextID = paymentContext ? paymentContext.id : '';
        return paymentContext.partner_metadata.order_id;
    }
    expressPaypal.showError();
    return '';
}

/**
 * Calls PayPal express Restore basket function
 */
function onCancel() {
    var csrfToken = $('input[name="csrf_token"]').val();
    $.ajax({
        type: 'POST',
        url: $('#ckoRestoreBasket').val(),
        async: false,
        data: {
            csrf_token: csrfToken,
        },
        success: function() {
            // basket restored successfully — nothing further to do
        },
        error: function() {
            expressPaypal.showError();
        },
    });
}

/**
 * Call PayPal Express Order Approval Function
 */
function onApprove() {
    expressPaypal.onApprovePayPalOrder(paymentContextID);
}

/**
 * Render PayPal Button on load in PDP page
 */
function renderPayPalButtons() {
    if (paypal_sdk) {
        paypal_sdk.Buttons({
            createOrder: createOrder,
            onApprove: onApprove,
            onCancel: onCancel,
            style: $('.paypal-dynamic-button-block').attr('data-paypal-button-config') ? JSON.parse($('.paypal-dynamic-button-block').attr('data-paypal-button-config')).pdp : '',
        }).render('#paypal-button-container');
    }
}

renderPayPalButtons();
