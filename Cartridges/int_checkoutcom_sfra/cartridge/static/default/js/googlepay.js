"use strict";
function launchGooglePay() {
  jQuery(".google-pay-button").click(function () {
    var baseRequest = { apiVersion: 2, apiVersionMinor: 0 };
    var allowedCardNetworks = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"];
    var allowedCardAuthMethods = ["PAN_ONLY", "CRYPTOGRAM_3DS"];
    var tokenizationSpecification = {
      type: "PAYMENT_GATEWAY",
      parameters: {
        gateway: "checkoutltd",
        gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val(),
      },
    };
    var baseCardPaymentMethod = {
      type: "CARD",
      parameters: {
        allowedAuthMethods: allowedCardAuthMethods,
        allowedCardNetworks: allowedCardNetworks,
      },
    };
    var baseTokenizedCardPaymentMethod = {
      type: "TOKENIZED_CARD",
      parameters: {
        allowedAuthMethods: allowedCardAuthMethods,
        allowedCardNetworks: allowedCardNetworks,
      },
    };
    var cardPaymentMethod = Object.assign({}, baseCardPaymentMethod, {
      tokenizationSpecification: tokenizationSpecification,
    });
    var tokenizedCardPaymentMethod = Object.assign({}, baseTokenizedCardPaymentMethod, {
      tokenizationSpecification: tokenizationSpecification,
    });

    var paymentsClient = null;

    function getGooglePaymentsClient() {
      if (paymentsClient === null) {
        paymentsClient = new google.payments.api.PaymentsClient({
          environment: jQuery('[id="ckoGooglePayEnvironment"]').val(),
          merchantInfo: {
            merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val(),
          },
        });
      }
      return paymentsClient;
    }

    function getGoogleTransactionInfo() {
      return {
        currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
        totalPriceStatus: "FINAL",
        totalPrice: $.trim(
          jQuery('[id="ckoGooglePayAmount"]').val().replaceAll(",", "")
        ),
      };
    }

    function getGooglePaymentDataRequest() {
      var paymentDataRequest = Object.assign({}, baseRequest);
      paymentDataRequest.allowedPaymentMethods = [cardPaymentMethod];
      paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
      paymentDataRequest.merchantInfo = {
        merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val(),
      };
      return paymentDataRequest;
    }

    getGooglePaymentsClient()
      .isReadyToPay(
        Object.assign({}, baseRequest, {
          allowedPaymentMethods: [cardPaymentMethod, tokenizedCardPaymentMethod],
        })
      )
      .then(function (response) {
        if (response.result) {
          var prefetchRequest = getGooglePaymentDataRequest();
          prefetchRequest.transactionInfo = {
            totalPriceStatus: "NOT_CURRENTLY_KNOWN",
            currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
          };
          getGooglePaymentsClient().prefetchPaymentData(prefetchRequest);
        }
      })
      .catch(function (err) {
        console.log(err);
      });

    var paymentDataRequest = getGooglePaymentDataRequest();
    getGooglePaymentsClient()
      .loadPaymentData(paymentDataRequest)
      .then(function (paymentData) {
        var token = JSON.parse(paymentData.paymentMethodData.tokenizationData.token);
        var ckoGooglePayData = {
          signature: token.signature,
          protocolVersion: token.protocolVersion,
          signedMessage: token.signedMessage,
        };
        jQuery("#ckoGooglePayData").val(JSON.stringify(ckoGooglePayData));
        if (
          $('input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]').val() === ""
        ) {
          $("#google-pay-content .invalid-field-message").text(
            window.ckoLang.googlePayDataInvalid
          );
        } else {
          $("button.submit-payment").trigger("click");
        }
      })
      .catch(function (err) {
        console.log(err);
      });
  });
}
document.addEventListener(
  "DOMContentLoaded",
  function () {
    launchGooglePay();
  },
  false
);
