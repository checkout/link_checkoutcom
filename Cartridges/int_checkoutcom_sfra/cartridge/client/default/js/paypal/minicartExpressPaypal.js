
'use strict';

var paymentContextID;
var expressPaypal = require('./expressPaypal');

/**
 * Calls PayPal express Create Order API Route
 * @return {Object} - order_id returned from api response
 */
function createOrder() {
    var paymentContext = expressPaypal.createPayPalOrder();
    paymentContextID = paymentContext ? paymentContext.id : '';
    return paymentContext.partner_metadata.order_id;
}

/**
 * Call PayPal Express Order Approval Function
 */
function onApprove() {
    expressPaypal.onApprovePayPalOrder(paymentContextID);
}


/**
 * Render PayPal Button on minicart hover in all pages
 */
function miniCartPayPalSDK() {
    if ($('#paypal-button-container-minicart').length > 0 && paypal_sdk) {
        paypal_sdk.Buttons({
            createOrder: createOrder,
            onApprove: onApprove,
            style: $('.paypal-dynamic-button-block').attr('data-paypal-button-config') ? JSON.parse($('.paypal-dynamic-button-block').attr('data-paypal-button-config')).minicart : '',
        }).render('#paypal-button-container-minicart');
    }
}

module.exports = {
    miniCartPayPalSDK: miniCartPayPalSDK,
};
