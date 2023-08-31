"use strict";
function launchGooglePay() {
  jQuery(".cko-google-pay-button").click(function() {
    var e = ["CARD", "TOKENIZED_CARD"],
      o = ["VISA", "MASTERCARD", "AMEX", "JCB", "DISCOVER"],
      t = {
        tokenizationType: "PAYMENT_GATEWAY",
        parameters: {
          gateway: "checkoutltd",
          gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val(),
        },
      };
    a()
      .isReadyToPay({ allowedPaymentMethods: e })
      .then(function(e) {
        var o;
        e.result &&
          (((o = r()).transactionInfo = {
            totalPriceStatus: "NOT_CURRENTLY_KNOWN",
            currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
          }),
          a().prefetchPaymentData(o));
      })
      .catch(function(e) {
        console.log(e);
      });
    var n = r();
    function a() {
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
    (n.transactionInfo = {
      currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
      totalPriceStatus: "FINAL",
      totalPrice: jQuery('[id="ckoGooglePayAmount"]').val(),
    }),
      a()
        .loadPaymentData(n)
        .then(function(e) {
          !(function(e) {
            var o = {
              signature: JSON.parse(e.paymentMethodToken.token).signature,
              protocolVersion: JSON.parse(e.paymentMethodToken.token)
                .protocolVersion,
              signedMessage: JSON.parse(e.paymentMethodToken.token)
                .signedMessage,
            };
            jQuery('[id="dwfrm_googlePayForm_data"]').val(JSON.stringify(o));
            if ('' === $('input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]').val()) {
              $('.ckoGooglePayButton-invalid-field-message').text(window.ckoLang.googlePayDataInvalid);
            } else {
              $('.button-fancy-large').removeClass('no-click disabled');
              $('#dwfrm_billing').submit();
            }
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
    $('.input-radio').click(function() {
      if ($(this).val() === 'CHECKOUTCOM_GOOGLE_PAY') {
        $('.button-fancy-large').addClass('no-click disabled');
      } else {
        $('.button-fancy-large').removeClass('no-click disabled');
      }
    });
    launchGooglePay();
  },
  !1
);
