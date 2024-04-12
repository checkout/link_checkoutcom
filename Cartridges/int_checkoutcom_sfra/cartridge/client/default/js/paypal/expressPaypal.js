
'use strict';

var paymentContextID;

/**
 * Shows error message when paypal express checkout payment failed
 * @param {string} message - Error message returned
 */
function showError(message) {
    var defaultErrorMessage = 'Payment via PayPal is unavailable at this time; please try again later or select a different payment method';
    $('.pdp-paypal-error').remove();
    var errorHtml = '<div class="pdp-paypal-error collapse">'
                            + '<div class="alert alert-danger alert-dismissible valid-cart-error fade show" role="alert">'
                                + '<button type="button" class="close" data-dismiss="alert" aria-label="Close">'
                                    + '<span aria-hidden="true">&times;</span>'
                                + '</button>'
                                + (message || defaultErrorMessage)
                            + '</div>'
                        + '</div>';
    $('#maincontent').prepend(errorHtml);
    $('.pdp-paypal-error').show('fast', function() {
        setTimeout(function() {
            jQuery('.pdp-paypal-error').hide('fast');
        }, 7000);
    });
    $('html, body').animate({
        scrollTop: $('.pdp-paypal-error').offset().top,
    }, 200);
}

/**
 * Create a PayPal Order Context from the basket records.Shipping details are ignored
 * @return {Object} - Payment Context records returned in API.
 */
function createPayPalOrder() {
    var paymentContext;
    $.ajax({
        type: 'POST',
        url: $('#payPalCreateOrderUrl').val(),
        async: false,
        data: {
            getFromFile: 'get_from_file',
        },
        success: function(response) {
            paymentContext = response;
            if (!response || response.error) {
                showError(response && response.message);
            }
        },
        error: function(e) {
            console.log(e);
            showError();
        },
    });
    return paymentContext;
}

/**
 * On Payment Approval trigger express payment controller endpoint
 * @param {string} paymentContextId - payment Context ID
 */
function onApprovePayPalOrder(paymentContextId) {
    $.spinner().start();
    $.ajax({
        type: 'POST',
        url: $('#ckoPayPalExpressCheckout').val(),
        dataType: 'text',
        data: {
            paymentContextId: paymentContextId,
        },
        success: function(response) {
            if (response.error) {
                showError(response.message);
            } else if (response.redirectUrl) {
                location.href = response.redirectUrl;
            } else {
                var responseObj = JSON.parse(response);
                var redirect = $('<form>').appendTo(document.body)
                    .attr({
                        method: 'POST',
                        action: responseObj.continueUrl,
                    });
                $('<input>').appendTo(redirect)
                    .attr({
                        name: 'orderID',
                        value: responseObj.orderID,
                    });
                $('<input>').appendTo(redirect)
                    .attr({
                        name: 'orderToken',
                        value: responseObj.orderToken,
                    });
                redirect.submit();
            }
            $.spinner().stop();
        },
        error: function(e) {
            console.log(e);
            showError();
            $.spinner().stop();
        },
    });
}

/**
 * Call PayPal Express Order Approval Function
 */
function onApprove() {
    onApprovePayPalOrder(paymentContextID);
}

/**
 * Calls PayPal express Create Order API Route
 * @return {Object} - order_id returned from api response
 */
function createOrder() {
    var paymentContext = createPayPalOrder();
    paymentContextID = paymentContext ? paymentContext.id : '';
    return paymentContext.partner_metadata.order_id;
}

/**
 * Render PayPal Button on load in cart
 */
function renderPayPalButtons() {
    if ($('#paypal-button-container-cart').length > 0 && paypal_sdk && $('#paypal-button-container-cart').attr('data-show-paypal') !== 'false') {
        $('#paypal-button-container-cart').attr('data-show-paypal', 'false');
        paypal_sdk.Buttons({
            createOrder: createOrder,
            onApprove: onApprove,
            style: $('.paypal-dynamic-button-block').attr('data-paypal-button-config') ? JSON.parse($('.paypal-dynamic-button-block').attr('data-paypal-button-config')).cart : '',
        }).render('#paypal-button-container-cart');
    }
}

renderPayPalButtons();

module.exports = {
    createPayPalOrder: createPayPalOrder,
    onApprovePayPalOrder: onApprovePayPalOrder,
    showError: showError,
};
