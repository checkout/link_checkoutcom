"use strict";
function launchGooglePay() {
  jQuery(".google-pay-button").click(function() {
    var e = ["CARD", "TOKENIZED_CARD"],
      o = ["VISA", "MASTERCARD", "AMEX", "JCB", "DISCOVER"],
      t = {
        tokenizationType: "PAYMENT_GATEWAY",
        parameters: {
          gateway: "checkoutltd",
          gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val(),
        },
      };
    n()
      .isReadyToPay({ allowedPaymentMethods: e })
      .then(function(e) {
        var o;
        e.result &&
          (((o = r()).transactionInfo = {
            totalPriceStatus: "NOT_CURRENTLY_KNOWN",
            currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
          }),
          n().prefetchPaymentData(o));
      })
      .catch(function(e) {
        console.log(e);
      });
    var a = r();
    function n() {
      return new google.payments.api.PaymentsClient({
        environment: jQuery('[id="ckoGooglePayEnvironment"]').val(),
      });
    }
    function r() {
      return {
        merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val(),
        paymentMethodTokenizationParameters: t,
        allowedPaymentMethods: e,
        cardRequirements: { allowedCardNetworks: o },
      };
    }
    (a.transactionInfo = {
      currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
      totalPriceStatus: "FINAL",
      totalPrice: $.trim(jQuery('[id="ckoGooglePayAmount"]').val().replaceAll(",", "")),
    }),
      n()
        .loadPaymentData(a)
        .then(function(e) {
          !(function(e) {
            var o = {
              signature: JSON.parse(e.paymentMethodToken.token).signature,
              protocolVersion: JSON.parse(e.paymentMethodToken.token)
                .protocolVersion,
              signedMessage: JSON.parse(e.paymentMethodToken.token)
                .signedMessage,
            };
            jQuery("#ckoGooglePayData").val(JSON.stringify(o)),
              "" ===
              $(
                'input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]'
              ).val()
                ? $("#google-pay-content .invalid-field-message").text(
                    window.ckoLang.googlePayDataInvalid
                  )
                : $("button.submit-payment").trigger("click");
          })(e);
        })
        .catch(function(e) {
          console.log(e);
        });
  });
}
document.addEventListener(
  "DOMContentLoaded",
  function() {
    launchGooglePay();
  },
  !1
);
