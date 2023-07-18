"use strict";
var shippingMethods,
  shippingCostValues,
  shippingTaxes,
  discounts,
  defaultShippingMethodId;
function minicartLaunchGooglePay() {
  jQuery(".minicart-google-pay-button").click(function() {
    var e = document
            .getElementsByClassName("mini-cart-subtotals")[0]
            .getElementsByClassName("value")[0]
            .innerText
            .match(/\d+/)[0],
      t = $("#shipM").val();
    $.ajax({
      type: "GET",
      url: t,
      success: function(e) {
        (shippingCostValues = e.shipCosts),
          (shippingMethods = e.shipMethods),
          (shippingTaxes = e.shipTaxes),
          (discounts = e.discounts);
      },
    });
    const a = { apiVersion: 2, apiVersionMinor: 0 },
      n = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"],
      i = ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      s = {
        type: "PAYMENT_GATEWAY",
        parameters: {
          gateway: "checkoutltd",
          gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val(),
        },
      },
      o = {
        type: "CARD",
        parameters: { allowedAuthMethods: i, allowedCardNetworks: n },
      },
      r = {
        type: "TOKENIZED_CARD",
        parameters: { allowedAuthMethods: i, allowedCardNetworks: n },
      },
      p = Object.assign({}, o, { tokenizationSpecification: s }),
      c = Object.assign({}, r, { tokenizationSpecification: s });
    let l = null;
    u()
      .isReadyToPay(Object.assign({}, a, { allowedPaymentMethods: [p, c] }))
      .then(function(e) {
        e.result &&
          (function() {
            var e = h();
            (e.transactionInfo = {
              totalPriceStatus: "NOT_CURRENTLY_KNOWN",
              currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
            }),
              u().prefetchPaymentData(e);
          })();
      })
      .catch(function(e) {
        console.log(e);
      });
    var d = h();
    function u() {
      return (
        null === l &&
          (l = new google.payments.api.PaymentsClient({
            environment: "TEST",
            merchantInfo: {
              merchantName: "Example Merchant",
              merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val(),
            },
            paymentDataCallbacks: {
              onPaymentAuthorized: m,
              onPaymentDataChanged: I,
            },
          })),
        l
      );
    }
    function h() {
      const e = Object.assign({}, a);
      return (
        (e.allowedPaymentMethods = [p]),
        (e.transactionInfo = g()),
        (e.merchantInfo = { merchantName: "Example Merchant" }),
        (e.emailRequired = !0),
        (e.callbackIntents = [
          "SHIPPING_ADDRESS",
          "SHIPPING_OPTION",
          "PAYMENT_AUTHORIZATION",
        ]),
        (e.shippingAddressRequired = !0),
        (e.shippingAddressParameters = { phoneNumberRequired: !0 }),
        (e.shippingOptionRequired = !0),
        e
      );
    }
    function g(t) {
      var a, n;
      t && ((a = shippingTaxes[t]), (n = "-" + discounts[t]));
      var i = {
        displayItems: [
          { label: "Subtotal", type: "SUBTOTAL", price: e },
          { label: "Tax", type: "TAX", price: a || "1.00" },
        ],
        currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
        totalPriceStatus: "FINAL",
        totalPrice: e,
        totalPriceLabel: "Total",
      };
      if (t && parseFloat(discounts[t]) > 0) {
        var s = { label: "Discounts", type: "DISCOUNT", price: n || "0.00" };
        i.displayItems.push(s);
      }
      return i;
    }
    function m(e) {
      return new Promise(function(t, a) {
        (function(e) {
          return new Promise(function(t, a) {
            setTimeout(function() {
              var a = {
                  signature: JSON.parse(
                    e.paymentMethodData.tokenizationData.token
                  ).signature,
                  protocolVersion: JSON.parse(
                    e.paymentMethodData.tokenizationData.token
                  ).protocolVersion,
                  signedMessage: JSON.parse(
                    e.paymentMethodData.tokenizationData.token
                  ).signedMessage,
                },
                n = e.shippingAddress,
                i = e.shippingOptionData,
                s = {
                  ckoGooglePayData: JSON.stringify(a),
                  shippingAddress: JSON.stringify(n),
                  shippingMethod: JSON.stringify(i),
                  email: e.email,
                };
              if (
                "" ===
                $(
                  'input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]'
                ).val()
              )
                $("#google-pay-content .invalid-field-message").text(
                  window.ckoLang.googlePayDataInvalid
                );
              else {
                var o = document.getElementById("cartUrl").value;
                $.ajax({
                  url: o,
                  data: s,
                  method: "POST",
                  success: function(e) {
                    e.error
                      ? $(".mini-cart-error").show()
                      : e.order
                      ? location.replace(e.url + "?" + e.order)
                      : location.replace(e.url);
                  },
                  error: function() {
                    console.log("error");
                  },
                });
              }
              t({});
            }, 3e3);
          });
        })(e)
          .then(function() {
            t({ transactionState: "SUCCESS" });
          })
          .catch(function() {
            t({
              transactionState: "ERROR",
              error: {
                intent: "PAYMENT_AUTHORIZATION",
                message: "Insufficient funds",
                reason: "PAYMENT_DATA_INVALID",
              },
            });
          });
      });
    }
    function I(e) {
      return new Promise(function(t, a) {
        let n = e.shippingAddress,
          i = e.shippingOptionData,
          s = {};
        var o = {
            firstName: "",
            lastName: "",
            address1: "",
            address2: "",
            stateCode: n.administrativeArea,
            city: n.locality,
            postalCode: n.postalCode,
            countryCode: n.countryCode,
            phone: "",
          },
          r = { address: JSON.stringify(o) };
        if (
          ($.ajax({
            type: "GET",
            async: !1,
            data: r,
            url: $("#shipM").val(),
            success: function(e) {
              (shippingCostValues = e.shipCosts),
                (shippingMethods = e.shipMethods),
                (shippingTaxes = e.shipTaxes),
                (discounts = e.discounts);
              var t = !1;
              (defaultShippingMethodId = e.defaultShippingMethod) in
                shippingCostValues && (t = !0),
                t ||
                  (defaultShippingMethodId = Object.keys(
                    shippingCostValues
                  )[0]);
            },
          }),
          "INITIALIZE" == e.callbackTrigger ||
            "SHIPPING_ADDRESS" == e.callbackTrigger)
        )
          if ("NJ" == n.administrativeArea)
            s.error = {
              reason: "SHIPPING_ADDRESS_UNSERVICEABLE",
              message: "Cannot ship to the selected address",
              intent: "SHIPPING_ADDRESS",
            };
          else {
            s.newShippingOptionParameters = {
              defaultSelectedOptionId: defaultShippingMethodId,
              shippingOptions: shippingMethods,
            };
            let e = s.newShippingOptionParameters.defaultSelectedOptionId;
            s.newTransactionInfo = y(e);
          }
        else
          "SHIPPING_OPTION" == e.callbackTrigger &&
            (s.newTransactionInfo = y(i.id));
        t(s);
      });
    }
    function y(e) {
      let t = g(e),
        a = shippingCostValues[e];
      t.displayItems.push({
        type: "LINE_ITEM",
        label: "Shipping cost",
        price: a,
        status: "FINAL",
      });
      let n = 0;
      return (
        t.displayItems.forEach((e) => (n += parseFloat(e.price))),
        (t.totalPrice = n.toFixed(2).toString()),
        t
      );
    }
    (d.transactionInfo = g()), (l = u()), l.loadPaymentData(d);
  });
}
minicartLaunchGooglePay();
