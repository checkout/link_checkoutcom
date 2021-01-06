'use strict';

/**
 * jQuery Ajax helpers on DOM ready.
 */
document.addEventListener('DOMContentLoaded', function() {
    // Launch Google Pay
    launchGooglePay();
}, false);

/**
 * Reset Form
 */
function resetFormErrors() {
    $('.contact-info-block .is-invalid').each(function() {
        $(this).removeClass('is-invalid');
    });
}

/**
 * Validate Email
 */
function validateEmail() {
    var emailAddress = $('input[name$="dwfrm_billing_contactInfoFields_email"]');

    // Check expiration month
    if (emailAddress.val() === '') {
        $('#emailInvalidMessage').text(
            window.ckoLang.apmEmailInvalid
        );
        emailAddress.addClass('is-invalid');

        return false;
    }

    return true;
}

function initCheckoutcomGooglePayValidation() {
    $('button.submit-payment').off('click touch').one('click touch', function(e) {
        if ($('input[name="dwfrm_billing_paymentMethod"]').val() === 'GOOGLE_PAY') {
            // Prevent the default button click behaviour
            e.preventDefault();
            e.stopImmediatePropagation();

            // Validate the payment data
            var field1 = $('input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]');
            if (field1.val() === '') {
                $('#google-pay-content .invalid-field-message').text(
                    window.ckoLang.googlePayDataInvalid
                );
            } else {
                $(this).trigger('click');
            }
        }
    });
}

function launchGooglePay() {
    jQuery('.google-pay-button').click(function() {
        var ckoGooglePayController = jQuery('[id="ckoGooglePayController"]').val();

        // Prepare the payment parameters
        var allowedPaymentMethods = ['CARD', 'TOKENIZED_CARD'];
        var allowedCardNetworks = ['VISA', 'MASTERCARD', 'AMEX', 'JCB', 'DISCOVER'];

        var tokenizationParameters = {
            tokenizationType: 'PAYMENT_GATEWAY',
            parameters: {
                gateway: 'checkoutltd',
            },
        };

        resetFormErrors();

        // valid email address and url is not empty
        if (ckoGooglePayController !== '' && validateEmail() ) {
            var xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function() {
                if (this.readyState === 4 && this.status === 200) {
                   // Typical action to be performed when the document is ready:
                    var responseData = JSON.parse(this.responseText);
                    tokenizationParameters.parameters.gatewayMerchantId = responseData.gatewayMerchantId;
                    var paymentDataRequest = {
                        paymentMethodTokenizationParameters: tokenizationParameters,
                        allowedPaymentMethods: allowedPaymentMethods,
                        cardRequirements: { 
                            allowedCardNetworks: allowedCardNetworks,
                        },
                    };

                    // Prepare the Google Pay client
                    onGooglePayLoaded(responseData);

                    /**
                     * Show Google Pay chooser when Google Pay purchase button is clicked
                     */
                    // var paymentDataRequest = getGooglePaymentDataConfiguration();
                    // paymentDataRequest.transactionInfo = getGoogleTransactionInfo();

                    paymentDataRequest.transactionInfo = {
                        currencyCode: responseData.currency,
                        totalPriceStatus: 'FINAL',
                        totalPrice: responseData.totalAmount,
                    };

                    var paymentsClient = getGooglePaymentsClient(responseData.environment);
                    paymentsClient.loadPaymentData(paymentDataRequest)
                        .then(
                            function(paymentData) {
                                // Handle the response
                                processPayment(paymentData);
                            }
                        )
                        .catch(
                            function(error) {
                                console.log(error);
                            }
                        );


                }
            };
            xhttp.open("GET", ckoGooglePayController, true);
            // Send the proper header information along with the request
            // xhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            xhttp.send();

        }





        /**
         * Initialize a Google Pay API client
         *
         * @returns {google.payments.api.PaymentsClient} Google Pay API client
         */
        function getGooglePaymentsClient(env) {
            return (new google.payments.api.PaymentsClient(
                {
                    environment: env === 'live' ? 'PRODUCTION' : 'TEST',
                }
            ));
        }

        /**
         * Initialize Google PaymentsClient after Google-hosted JavaScript has loaded
         */
        function onGooglePayLoaded(responseData) {
            var paymentsClient = getGooglePaymentsClient(responseData.environment);
            paymentsClient.isReadyToPay({ allowedPaymentMethods: allowedPaymentMethods })
                .then(
                    function(response) {
                        if (response.result) {
                            prefetchGooglePaymentData(responseData);
                        }
                    }
                )
                .catch(
                    function(error) {
                        console.log(error);
                    }
                );
        }

        /**
         * Configure support for the Google Pay API
         *
         * @see     {@link https://developers.google.com/pay/api/web/reference/object#PaymentDataRequest|PaymentDataRequest}
         * @returns {Object} PaymentDataRequest fields
         */
        function getGooglePaymentDataConfiguration(googlePayMerchantId) {
            return {
                merchantId: googlePayMerchantId,
                paymentMethodTokenizationParameters: tokenizationParameters,
                allowedPaymentMethods: allowedPaymentMethods,
                cardRequirements: {
                    allowedCardNetworks: allowedCardNetworks,
                },
            };
        }

        /**
         * Provide Google Pay API with a payment amount, currency, and amount status
         *
         * @see     {@link https://developers.google.com/pay/api/web/reference/object#TransactionInfo|TransactionInfo}
         * @returns {Object} transaction info, suitable for use as transactionInfo property of PaymentDataRequest
         */
        function getGoogleTransactionInfo() {
            return {
                currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
                totalPriceStatus: 'FINAL',
                totalPrice: jQuery('[id="ckoGooglePayAmount"]').val(),
            };
        }

        /**
         * Prefetch payment data to improve performance
         */
        function prefetchGooglePaymentData(responseData) {
            var paymentDataRequest = getGooglePaymentDataConfiguration(responseData.googlePayMerchantId);

            // TransactionInfo must be set but does not affect cache
            paymentDataRequest.transactionInfo = {
                totalPriceStatus: 'NOT_CURRENTLY_KNOWN',
                currencyCode: responseData.currency,
            };

            var paymentsClient = getGooglePaymentsClient();
            paymentsClient.prefetchPaymentData(paymentDataRequest);
        }

        /**
         * Process payment data returned by the Google Pay API
         *
         * @param {Object} paymentData response from Google Pay API after shopper approves payment
         * @see   {@link https://developers.google.com/pay/api/web/reference/object#PaymentData|PaymentData object reference}
         */
        function processPayment(paymentData) {
            // Prepare the payload
            var payload = {
                signature: JSON.parse(paymentData.paymentMethodToken.token).signature,
                protocolVersion: JSON.parse(paymentData.paymentMethodToken.token).protocolVersion,
                signedMessage: JSON.parse(paymentData.paymentMethodToken.token).signedMessage,
            };

            // Store the payload
            jQuery('#ckoGooglePayData').val(JSON.stringify(payload));
        }
    });
}
