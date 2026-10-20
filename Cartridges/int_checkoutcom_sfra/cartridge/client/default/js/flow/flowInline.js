'use strict';

/**
 * Checkout.com Flow inline mount.
 *
 * Mounts Flow in the checkout place order step instead of sending the shopper to
 * the CKOFlow-Show page. Called from js/checkout/checkout.js once
 * CheckoutServices-PlaceOrder has created the order and returned a
 * flowSessionUrl. The order exists before any money moves, exactly as with the
 * Flow page; only where the component is rendered changes.
 *
 * Whenever the inline mount is not possible (network error, unexpected
 * response), the shopper is sent to the Flow page at continueUrl instead, so the
 * order can always still be paid for.
 */
var flowComponent = require('./flowComponent');

var PANEL_CLASS = 'cko-flow-inline';

var SELECTORS = {
    container: '#cko-flow-inline-container',
    error: '#cko-flow-inline-error',
};

/**
 * Read the CSRF token the Flow billing tab rendered, which CKOFlow-Session
 * validates.
 * @returns {Object} The token name and value, empty when not found
 */
function getCsrfToken() {
    var input = document.querySelector('.flow-content input[name="csrf_token"]');

    return input ? { name: input.name, value: input.value } : {};
}

/**
 * Stop the shopper from editing a checkout step or placing the order again.
 * The order already exists and the basket has been consumed, so the edit
 * buttons and Place Order can no longer work. The cancel link in the Flow panel
 * is the way back: it fails the order and restores the basket.
 */
function lockCheckout() {
    $('#checkout-main .edit-button').addClass('d-none');
    $('#checkout-main .next-step-button').addClass('d-none');
}

/**
 * Build the panel Flow is mounted into, right below the payment summary.
 * @param {Object} config The Flow configuration returned by CKOFlow-Session
 */
function renderPanel(config) {
    $('.' + PANEL_CLASS).remove();

    var $panel = $('<div>').addClass('card ' + PANEL_CLASS);
    var $header = $('<div>').addClass('card-header clearfix');
    var $body = $('<div>').addClass('card-body');

    $('<h2>').addClass('pull-left card-header-custom').text(config.title).appendTo($header);

    $('<div>')
        .attr({ id: SELECTORS.error.slice(1), role: 'alert' })
        .addClass('alert alert-danger d-none')
        .appendTo($body);
    $('<div>')
        .attr('id', SELECTORS.container.slice(1))
        .addClass('cko-flow-container')
        .appendTo($body);
    $('<p>')
        .addClass('cko-flow-cancel')
        .append($('<a>').attr('href', config.failureUrl).text(config.cancelLabel))
        .appendTo($body);

    $panel.append($header, $body).insertAfter('#checkout-main .payment-summary');
}

/**
 * Map the CKOFlow-Session view data onto the configuration the Flow component
 * expects. The view data is shared with the Flow page template, which names the
 * JSON encoded values paymentSessionJson and appearanceJson.
 * @param {Object} viewData The ckoFlow object returned by CKOFlow-Session
 * @returns {Object} The Flow component configuration
 */
function toComponentConfig(viewData) {
    return $.extend({}, viewData, {
        paymentSession: viewData.paymentSessionJson,
        appearance: viewData.appearanceJson,
    });
}

/**
 * Fetch the payment session for the order just created and mount Flow inline.
 * @param {Object} placeOrderData The CheckoutServices-PlaceOrder response
 */
function start(placeOrderData) {
    var csrf = getCsrfToken();
    var data = {};

    if (csrf.name) {
        data[csrf.name] = csrf.value;
    }

    var fallback = function() {
        window.location.href = placeOrderData.continueUrl;
    };

    $.ajax({
        url: placeOrderData.flowSessionUrl,
        method: 'POST',
        data: data,
        dataType: 'json',
        success: function(response) {
            if (!response || response.error || !response.ckoFlow) {
                // The order could not be paid for and has been failed server side;
                // the redirect takes the shopper back to the payment step.
                if (response && response.redirectUrl) {
                    window.location.href = response.redirectUrl;
                } else {
                    fallback();
                }

                return;
            }

            renderPanel(response.ckoFlow);
            lockCheckout();

            if (!flowComponent.start(toComponentConfig(response.ckoFlow), SELECTORS)) {
                fallback();

                return;
            }

            $('html, body').animate({ scrollTop: $('.' + PANEL_CLASS).offset().top }, 300);
        },
        error: fallback,
    });
}

module.exports = {
    start: start,
};
