'use strict';

/**
 * ACH Direct Debit payment script.
 *
 * Loaded only when the ACH payment content is rendered on the billing page.
 *
 * Flow after shopper clicks Place Order on the Order Review page:
 *   1. SFRA CheckoutServices-PlaceOrder returns { achPending: true, orderID, orderToken,
 *      continueUrl: '' }.
 *   2. SFRA checkout.js creates a hidden <form action=""> with orderID/orderToken
 *      inputs and calls redirect.submit() — we intercept this DOM submit event.
 *   3. We call CKOMain-GetPlaidLinkToken to obtain a Plaid Link token server-side.
 *   4. We open the Plaid Link popup (SDK pre-loaded via script tag in achContent.isml).
 *   5. On Plaid onSuccess: we call CKOMain-ProcessAchPayment with the public token
 *      and account ID. The server exchanges tokens via the Plaid API, stores the
 *      processor token on the customer profile, and submits the payment to Checkout.com.
 *   6. We show a spinner with "Please wait while we process the payment" and start
 *      polling CKOMain-CheckAchWebhook every 5 seconds for up to 30 minutes.
 *   7. On confirmed: redirect to Order-Confirm.
 *      On failed:    redirect to Checkout-Begin with payment error.
 *      On error:     show inline error message.
 */

(function ($) {
    var POLL_INTERVAL_MS = 5000;            // 5 seconds between polls
    var MAX_WAIT_MS      = 30 * 60 * 1000; // 30 minutes (matches SFCC session timeout)

    var pollStartTime   = null;
    var pollTimer       = null;
    var currentOrderNo  = null;
    var currentToken    = null;
    var currentCheckUrl = null;

    // -------------------------------------------------------------------------
    // CSRF helper — reads the token rendered by achContent.isml into POST data
    // -------------------------------------------------------------------------

    function getCsrfData() {
        var name  = $('#achCsrfName').val();
        var value = $('#achCsrfValue').val();
        if (name && value) {
            var data = {};
            data[name] = value;
            return data;
        }
        return {};
    }

    // -------------------------------------------------------------------------
    // Spinner helpers
    // -------------------------------------------------------------------------

    function showSpinner() {
        $('body').spinner().start();
        var message = $('#achWaitingMessage').val();
        if (message) {
            $('body').append(
                $('<p class="ach-spinner-message">').text(message)
            );
        }
    }

    function hideSpinner() {
        $('.ach-spinner-message').remove();
        $('body').spinner().stop();
    }

    function showError(message) {
        hideSpinner();
        $('#ach-error-message')
            .text(message || 'Payment could not be completed. Please try again.')
            .removeClass('d-none');
    }

    // -------------------------------------------------------------------------
    // Polling
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Plaid Link flow
    // -------------------------------------------------------------------------

    /**
     * Opens the Plaid Link popup with the provided link token.
     * On success, calls the server to process the ACH payment.
     *
     * @param {string} linkToken  - Plaid link token from CKOMain-GetPlaidLinkToken
     * @param {string} orderNo    - SFCC order number
     * @param {string} orderToken - SFCC order token (for server-side validation)
     * @param {string} checkUrl   - URL for the webhook polling endpoint
     * @param {string} processUrl - URL for CKOMain-ProcessAchPayment
     */
    function openPlaidLink(linkToken, orderNo, orderToken, checkUrl, processUrl) {
        var handler = window.Plaid.create({
            token: linkToken,
            onSuccess: function (publicToken, metadata) {
                // metadata.accounts is the array of selected accounts per the Plaid API.
                // accounts[0].id is the account_id required for /processor/token/create.
                var accountId = (metadata && metadata.accounts && metadata.accounts.length > 0)
                    ? metadata.accounts[0].id
                    : '';

                $.ajax({
                    url: processUrl,
                    method: 'POST',
                    data: $.extend({
                        orderNo: orderNo,
                        token: orderToken,
                        publicToken: publicToken,
                        accountId: accountId,
                    }, getCsrfData()),
                    success: function (response) {
                        if (response.error) {
                            if (response.failureUrl) {
                                window.location.href = response.failureUrl;
                            } else {
                                showError(response.errorMessage || 'Payment could not be submitted. Please try again.');
                            }
                        } else {
                            showSpinner();
                            startPolling(orderNo, orderToken, checkUrl);
                        }
                    },
                    error: function () {
                        showError('Payment could not be submitted. Please try again.');
                    },
                });
            },
            onExit: function (err) {
                hideSpinner();
                if (err) {
                    showError('Bank connection was cancelled. Please try again.');
                }
            },
        });

        handler.open();
    }

    /**
     * Fetches a Plaid Link token from the server then opens the Plaid Link popup.
     *
     * @param {string} orderNo       - SFCC order number
     * @param {string} orderToken    - SFCC order token
     * @param {string} checkUrl      - URL for CKOMain-CheckAchWebhook
     * @param {string} getLinkUrl    - URL for CKOMain-GetPlaidLinkToken
     * @param {string} processUrl    - URL for CKOMain-ProcessAchPayment
     */
    function startAchFlow(orderNo, orderToken, checkUrl, getLinkUrl, processUrl) {
        $.ajax({
            url: getLinkUrl,
            method: 'POST',
            data: $.extend({ orderNo: orderNo, token: orderToken }, getCsrfData()),
            success: function (response) {
                if (response.error || !response.linkToken) {
                    if (response.failureUrl) {
                        window.location.href = response.failureUrl;
                    } else {
                        showError('Could not initialise bank connection. Please try again.');
                    }
                    return;
                }

                // Plaid SDK is loaded via <script> tag in achContent.isml
                openPlaidLink(response.linkToken, orderNo, orderToken, checkUrl, processUrl);
            },
            error: function () {
                showError('Could not initialise bank connection. Please try again.');
            },
        });
    }

    // -------------------------------------------------------------------------
    // Form intercept — triggered when SFRA checkout.js fires redirect.submit()
    // after PlaceOrder returns achPending:true with continueUrl:''
    // -------------------------------------------------------------------------

    $(document).ready(function () {
        $(document).on('submit', function (e) {
            var $form      = $(e.target);
            var orderNo    = $form.find('input[name="orderID"]').val();
            var orderToken = $form.find('input[name="orderToken"]').val();
            var checkUrl   = $('#achCheckUrl').val();
            var getLinkUrl = $('#achGetLinkTokenUrl').val();
            var processUrl = $('#achProcessUrl').val();

            if (!orderNo || !orderToken || !checkUrl || !getLinkUrl || !processUrl) { return; }
            if (e.target.getAttribute('action') !== '') { return; }

            e.preventDefault();
            e.stopImmediatePropagation();

            startAchFlow(orderNo, orderToken, checkUrl, getLinkUrl, processUrl);
        });
    });

}(jQuery));
