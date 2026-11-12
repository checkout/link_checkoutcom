'use strict';

/**
 * MB WAY async payment polling script.
 *
 * Loaded only when MB WAY payment content is rendered on the billing page.
 * Polls CKOMain-CheckMBWayWebhook every POLL_INTERVAL_MS milliseconds for
 * up to MAX_WAIT_MS (30 minutes, matching the SFCC session timeout).
 *
 * Possible server responses:
 *   { status: "pending"   }                          – keep polling
 *   { status: "confirmed", confirmUrl: "..." }        – redirect to order confirmation
 *   { status: "failed",    failureUrl: "..." }        – redirect to checkout error page
 *   { status: "error"     }                          – stop polling, show generic error
 *
 * Flow:
 *   1. CheckoutServices-PlaceOrder returns { mbwayPending: true, orderID, orderToken,
 *      continueUrl: '' } for MB WAY payments.
 *   2. SFRA checkout.js creates a hidden <form action=""> with orderID/orderToken
 *      inputs and calls redirect.submit() (jQuery, fires DOM submit event).
 *   3. We listen on the DOM submit event in capture phase to intercept that call,
 *      show the spinner overlay, and start polling instead of navigating.
 */

(function ($) {
    var POLL_INTERVAL_MS = 5000;            // 5 seconds between polls
    var MAX_WAIT_MS      = 30 * 60 * 1000; // 30 minutes

    var pollStartTime   = null;
    var pollTimer       = null;
    var currentOrderNo  = null;
    var currentToken    = null;
    var currentCheckUrl = null;

    function showSpinner() {
        $('body').spinner().start();
        var message = $('#mbwayWaitingMessage').val();
        if (message) {
            $('body').append(
                $('<p class="mbway-spinner-message">').text(message)
            );
        }
    }

    function hideSpinner() {
        $('.mbway-spinner-message').remove();
        $('body').spinner().stop();
    }

    function showError(message) {
        hideSpinner();
        $('#mbway-error-message')
            .text(message || 'Payment could not be completed. Please try again.')
            .removeClass('d-none');
    }

    function stopPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function poll() {
        if (Date.now() - pollStartTime >= MAX_WAIT_MS) {
            stopPolling();
            showError('Payment timed out. Please try again.');
            return;
        }

        $.ajax({
            url: currentCheckUrl,
            method: 'GET',
            data: { orderNo: currentOrderNo, token: currentToken },
            success: function (response) {
                if (response.status === 'confirmed' && response.confirmUrl) {
                    stopPolling();
                    window.location.href = response.confirmUrl;
                } else if (response.status === 'failed') {
                    stopPolling();
                    if (response.failureUrl) {
                        window.location.href = response.failureUrl;
                    } else {
                        showError('Payment was declined. Please try again.');
                    }
                } else if (response.status === 'error') {
                    stopPolling();
                    showError('Payment could not be completed. Please try again.');
                } else {
                    // 'pending' — schedule next poll
                    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
                }
            },
            error: function () {
                // Network / server error — keep polling
                pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
            },
        });
    }

    function startPolling(orderNo, orderToken, checkUrl) {
        currentOrderNo  = orderNo;
        currentToken    = orderToken;
        currentCheckUrl = checkUrl;
        pollStartTime   = Date.now();
        pollTimer       = setTimeout(poll, POLL_INTERVAL_MS);
    }

    /**
     * Intercept the redirect form that SFRA checkout.js creates after PlaceOrder
     * succeeds with continueUrl:''. jQuery's redirect.submit() propagates through
     * jQuery's event system — we use $(document).on('submit') so our handler runs
     * before jQuery calls native form.submit() and can preventDefault() to stop it.
     */
    $(document).ready(function () {
        $(document).on('submit', function (e) {
            var $form  = $(e.target);
            var orderNo    = $form.find('input[name="orderID"]').val();
            var orderToken = $form.find('input[name="orderToken"]').val();
            var mbwayUrl   = $('#mbwayCheckUrl').val();

            if (!orderNo || !orderToken || !mbwayUrl) { return; }
            if (e.target.getAttribute('action') !== '') { return; }

            e.preventDefault();
            e.stopImmediatePropagation();

            showSpinner();
            startPolling(orderNo, orderToken, mbwayUrl);
        });
    });

}(jQuery));
