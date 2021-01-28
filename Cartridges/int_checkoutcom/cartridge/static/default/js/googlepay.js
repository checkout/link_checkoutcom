'use strict';

/**
 * jQuery Ajax helpers on DOM ready.
 */
document.addEventListener('DOMContentLoaded', function() {
    // Launch Google Pay
    jQuery('#is-GOOGLE_PAY').click(function() {
        var ckoGooglePayController = jQuery('[id="ckoGooglePayController"]').val();

        const baseRequest = {
            apiVersion: 2,
            apiVersionMinor: 0
        };

        const tokenizationSpecification = {
            type: 'PAYMENT_GATEWAY',
            parameters: {
                'gateway': 'checkoutltd'
            }
        };

        const allowedCardNetworks = ["AMEX", "DISCOVER", "INTERAC", "JCB", "MASTERCARD", "VISA"];

        const allowedCardAuthMethods = ["PAN_ONLY", "CRYPTOGRAM_3DS"];

        const baseCardPaymentMethod = {
            type: 'CARD',
            parameters: {
              allowedAuthMethods: allowedCardAuthMethods,
              allowedCardNetworks: allowedCardNetworks
            }
        };

        const cardPaymentMethod = Object.assign(
            {tokenizationSpecification: tokenizationSpecification},
            baseCardPaymentMethod
        );

        const paymentDataRequest = Object.assign({}, baseRequest);
        paymentDataRequest.allowedPaymentMethods = [cardPaymentMethod];

        if (ckoGooglePayController !== '' ) {
            var xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function() {
                if (this.readyState === 4 && this.status === 200) {
                    // Typical action to be performed when the document is ready:
                    var responseData = JSON.parse(this.responseText);

                    tokenizationSpecification.parameters.gatewayMerchantId = responseData.gatewayMerchantId;

                    paymentDataRequest.merchantInfo = {
                        merchantName: responseData.merchantName,
                        merchantId: responseData.googlePayMerchantId
                    };

                    paymentDataRequest.transactionInfo = {
                        totalPriceStatus: 'FINAL',
                        totalPrice: responseData.totalAmount,
                        currencyCode: responseData.currency,
                        countryCode: $('select[name$="dwfrm_billing_billingAddress_addressFields_country"]').val().toUpperCase()
                    };

                    const paymentsClient = new google.payments.api.PaymentsClient({
                        environment: responseData.mode
                    });

                    const isReadyToPayRequest = Object.assign({}, baseRequest);
                    isReadyToPayRequest.allowedPaymentMethods = [baseCardPaymentMethod];

                    // add data
                    baseRequest.merchantInfo = {
                        "merchantName": responseData.merchantName
                    };

                    paymentsClient.isReadyToPay(isReadyToPayRequest)
                    .then(function(response) {
                        if (response.result) {
                          var button = jQuery('.gpay-button');

                            if (button.length < 1) {
                              // add a Google Pay payment button
                              button = paymentsClient.createButton({onClick: () => {

                                  paymentsClient.loadPaymentData(paymentDataRequest).then(function(paymentData){
                                      // if using gateway tokenization, pass this token without modification
                                      var paymentToken = paymentData.paymentMethodData.tokenizationData.token;
                                      // Prepare the payload
                                      var payload = {
                                          signature: JSON.parse(paymentToken).signature,
                                          protocolVersion: JSON.parse(paymentToken).protocolVersion,
                                          signedMessage: JSON.parse(paymentToken).signedMessage,
                                      };

                                      // Store the payload
                                      jQuery('input[name$="dwfrm_googlePayForm_data"]').val(JSON.stringify(payload));
                                      jQuery('.gpay-button').hide();
                                    }).catch(function(err){
                                      // show error in developer console for debugging
                                      console.error(err);
                                    });

                              }, buttonColor: 'default', buttonType: 'plain', buttonSizeMode: 'standard'});
                              jQuery('#googlePayForm').append(button);
                            }
                        }
                    })
                    .catch(function(err) {
                        // show error in developer console for debugging
                        console.error(err);
                    });

                }
            };
            xhttp.open("GET", ckoGooglePayController, true);
            // Send the proper header information along with the request
            // xhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            xhttp.send();
        }
    });
}, false);
