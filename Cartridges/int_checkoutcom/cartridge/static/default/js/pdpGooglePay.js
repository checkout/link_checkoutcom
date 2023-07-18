"use strict";
var shippingMethods,
  shippingCosts,
  discounts,
  productDiscountTotal,
  defaultShippingMethodId,
  salesTax = {};
function launchGooglePay() {
  jQuery(".cko-google-pay-button").click(function() {
    $.ajax({
      url: document.getElementById("createBasketForPDP").value,
      data: { productID: $("#productId").val() },
      method: "POST",
      success: function(e) {
        console.log("success");
      },
      error: function(e) {
        console.log(e);
      },
    });
    var e = document
        .getElementsByClassName("price-sales")[0]
        .innerText.replace(/[^\d\.\,\s]+/g, "")
        .replaceAll(",", ""),
      t = $("#shippingMethodsFetch").val();
    $.ajax({
      type: "GET",
      url: t,
      success: function(e) {
        (shippingCosts = e.shipCosts),
          (shippingMethods = e.shipMethods),
          (salesTax = e.salesTax),
          (discounts = e.discounts),
          (productDiscountTotal = e.productDiscountTotal);
      },
    });
    const a = { apiVersion: 2, apiVersionMinor: 0 },
      n = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"],
      o = ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      s = {
        type: "PAYMENT_GATEWAY",
        parameters: {
          gateway: "checkoutltd",
          gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val(),
        },
      },
      i = {
        type: "CARD",
        parameters: { allowedAuthMethods: o, allowedCardNetworks: n },
      },
      r = {
        type: "TOKENIZED_CARD",
        parameters: { allowedAuthMethods: o, allowedCardNetworks: n },
      },
      c = Object.assign({}, i, { tokenizationSpecification: s }),
      l = Object.assign({}, r, { tokenizationSpecification: s });
    let p = null;
    u()
      .isReadyToPay(Object.assign({}, a, { allowedPaymentMethods: [c, l] }))
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
        null === p &&
          (p = new google.payments.api.PaymentsClient({
            environment: "TEST",
            merchantInfo: {
              merchantName: "Example Merchant",
              merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val(),
            },
            paymentDataCallbacks: {
              onPaymentAuthorized: f,
              onPaymentDataChanged: m,
            },
          })),
        p
      );
    }
    function h() {
      const e = Object.assign({}, a);
      return (
        (e.allowedPaymentMethods = [c]),
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
      (a = productDiscountTotal
        ? (parseFloat(e) + productDiscountTotal).toFixed(2)
        : e),
        t && (n = "-" + discounts[t]);
      var o = {
        displayItems: [
          { label: "Subtotal", type: "SUBTOTAL", price: $.trim(a.toString()) },
          { label: "Tax", type: "TAX", price: salesTax[t] || "0.00" },
        ],
        currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
        totalPriceStatus: "FINAL",
        totalPrice: $.trim(e),
        totalPriceLabel: "Total",
      };
      if (t && parseFloat(discounts[t]) > 0) {
        var s = { label: "Discounts", type: "DISCOUNT", price: n || "0.00" };
        o.displayItems.push(s);
      }
      return o;
    }
    function f(e) {
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
                o = e.shippingOptionData,
                s = {
                  ckoGooglePayData: JSON.stringify(a),
                  shippingAddress: JSON.stringify(n),
                  shippingMethod: JSON.stringify(o),
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
                var i = document.getElementById("googlePayExpressCheckout")
                  .value;
                $.ajax({
                  url: i,
                  data: s,
                  method: "POST",
                  success: function(e) {
                    if (e.error) {
                      var t = location.href,
                        a = new URL(t).searchParams.has("hasError");
                      if ((sessionStorage.setItem("reloading", "true"), a))
                        location.reload();
                      else {
                        let e = new URL(location.href),
                          t = new URLSearchParams(e.search);
                        t.set("hasError", !0),
                          (window.location.search = t.toString());
                      }
                    } else
                      e.order
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
    function m(e) {
      return new Promise(function(t, a) {
        let n = e.shippingAddress,
          o = e.shippingOptionData,
          s = {};
        var i = {
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
          r = { address: JSON.stringify(i) };
        if (
          ($.ajax({
            type: "GET",
            async: !1,
            data: r,
            url: $("#shippingMethodsFetch").val(),
            success: function(e) {
              (shippingCosts = e.shipCosts),
                (shippingMethods = e.shipMethods),
                (salesTax = e.salesTax),
                (discounts = e.discounts);
              var t = !1;
              (defaultShippingMethodId = e.defaultShippingMethod) in
                shippingCosts && (t = !0),
                t || (defaultShippingMethodId = Object.keys(shippingCosts)[0]);
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
            s.newTransactionInfo = I(e);
          }
        else
          "SHIPPING_OPTION" == e.callbackTrigger &&
            (s.newTransactionInfo = I(o.id));
        t(s);
      });
    }
    function I(e) {
      let t = g(e),
        a = shippingCosts[e];
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
    (d.transactionInfo = g()),
      (p = u()),
      p
        .loadPaymentData(d)
        .then(function(e) {})
        .catch(function(e) {
          location.reload(), console.log(e);
        });
  });
}
launchGooglePay();
