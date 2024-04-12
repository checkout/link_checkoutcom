
'use strict';

var paymentContextID;
var expressPaypal = require('./expressPaypal');
var base = require('../product/base');

/**
 * Delete old basket records and create new basket with ckoProductID data
 * @return {Object} - response
 */
function createBasketFromPDP() {
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
        },
        method: 'POST',
        success: function(e) {
            console.log(e);
            response = e;
        },
        error: function(e) {
            console.log(e);
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
    $.ajax({
        type: 'POST',
        url: $('#ckoRestoreBasket').val(),
        async: false,
        data: '',
        success: function(response) {
            console.log('basket restored successfully');
        },
        error: function(e) {
            expressPaypal.showError();
            console.log(e);
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
