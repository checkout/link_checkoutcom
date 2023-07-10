"use strict";
function launchGooglePay() {
  jQuery(".google-pay-button").click(function() {
    var e = $.trim($(".tax-total")
        .text()
        .replace(/[^\d\.\,\s]+/g, "")
        .replaceAll(",", "")) ||
        $.trim($(".shipping-cost")
        .text()
        .replace(/[^\d\.\,\s]+/g, "")
        .replaceAll(",", "")),
      t = $(".line-item-total-price-amount"),
      a = 0,
      n = $.trim($(".sub-total")
        .text()
        .replace(/[^\d\.\,\s]+/g, "")
        .replaceAll(",", ""));
    for (let e = 0; e < t.length; e++) {
      var o = t[e].innerHTML;
      (o = o.replaceAll(",", "")),
        (o = Number(o.replace(/[^\d\.\,\s]+/g, ""))),
        (a += o);
    }
    const i = { apiVersion: 2, apiVersionMinor: 0 },
      r = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"],
      s = ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      c = {
        type: "PAYMENT_GATEWAY",
        parameters: {
          gateway: "checkoutltd",
          gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val(),
        },
      },
      l = {
        type: "CARD",
        parameters: { allowedAuthMethods: s, allowedCardNetworks: r },
      },
      d = {
        type: "TOKENIZED_CARD",
        parameters: { allowedAuthMethods: s, allowedCardNetworks: r },
      },
      p = Object.assign({}, l, { tokenizationSpecification: c }),
      u = Object.assign({}, d, { tokenizationSpecification: c });
    var g;
    let y = null;
    var h,
      m,
      f,
      I = [];
    $.ajax({
      url: document.getElementById("ckoGetShippingMethods").value,
      method: "POST",
      success: function(e) {
        (h = e.shipMethods),
          (m = e.shipCosts),
          (I = e.salesTax),
          (g = e.discounts);
      },
      error: function(e) {
        console.log(e);
      },
    }),
      S()
        .isReadyToPay(Object.assign({}, i, { allowedPaymentMethods: [p, u] }))
        .then(function(e) {
          e.result &&
            (function() {
              var e = N();
              (e.transactionInfo = {
                totalPriceStatus: "NOT_CURRENTLY_KNOWN",
                currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
              }),
                S().prefetchPaymentData(e);
            })();
        })
        .catch(function(e) {
          console.log(e);
        });
    var P = N();
    function S() {
      return (
        null === y &&
          (y = new google.payments.api.PaymentsClient({
            environment: "TEST",
            merchantInfo: {
              merchantName: "Example Merchant",
              merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val(),
            },
            paymentDataCallbacks: {
              onPaymentAuthorized: O,
              onPaymentDataChanged: T,
            },
          })),
        y
      );
    }
    function N() {
      const e = Object.assign({}, i);
      return (
        (e.allowedPaymentMethods = [p]),
        (e.transactionInfo = A()),
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
    function A(t) {
      if (t)
        var o = I[t],
          i = "-" + g[t];
      var r = {
        displayItems: [
          { label: "Subtotal", type: "SUBTOTAL", price: n || a.toString() },
          { label: "Tax", type: "TAX", price: o || e },
        ],
        currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
        totalPriceStatus: "FINAL",
        totalPrice: n || a.toString(),
        totalPriceLabel: "Total",
      };
      if (t && parseFloat(g[t]) > 0) {
        var s = { label: "Discounts", type: "DISCOUNT", price: i || "0.00" };
        r.displayItems.push(s);
      }
      return r;
    }
    function O(e) {
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
                o = e.shippingOptionData;
              jQuery("#ckoGooglePayData").val(JSON.stringify(a));
              var i = {
                ckoGooglePayData: JSON.stringify(a),
                shippingAddress: JSON.stringify(n),
                shippingMethod: JSON.stringify(o),
                pid: jQuery('[id="ckoProductID"]').val(),
                email: e.email,
              };
              "" ===
              $(
                'input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]'
              ).val()
                ? $("#google-pay-content .invalid-field-message").text(
                    window.ckoLang.googlePayDataInvalid
                  )
                : $.ajax({
                    url: document.getElementById("ckoGooglePayExpressCheckout")
                      .value,
                    data: i,
                    method: "POST",
                    success: function(e) {
                      e.error
                        ? jQuery(".google-pay-cart-error-messaging").show(
                            "fast",
                            function() {
                              setTimeout(function() {
                                jQuery(".google-pay-cart-error-messaging").hide(
                                  "fast"
                                );
                              }, 7e3);
                            }
                          )
                        : e.redirectUrl
                        ? (location.href = e.redirectUrl)
                        : (document.getElementsByClassName(
                            "page"
                          )[0].innerHTML = e);
                    },
                    error: function(e) {
                      console.log(e);
                    },
                  }),
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
    function T(e) {
      return new Promise(function(t, a) {
        let n = e.shippingAddress,
          o = e.shippingOptionData,
          i = {};
        var r = {
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
          s = { address: JSON.stringify(r) };
        if (
          ($.ajax({
            type: "POST",
            async: !1,
            data: s,
            url: document.getElementById("ckoGetShippingMethods").value,
            success: function(e) {
              (m = e.shipCosts),
                (h = e.shipMethods),
                (I = e.salesTax),
                (g = e.discounts);
              var t = !1;
              (f = e.defaultShippingMethod) in m && (t = !0),
                t || (f = Object.keys(m)[0]);
            },
            error: function(e) {
              console.log(e);
            },
          }),
          "INITIALIZE" == e.callbackTrigger ||
            "SHIPPING_ADDRESS" == e.callbackTrigger)
        )
          if ("NJ" == n.administrativeArea)
            i.error = {
              reason: "SHIPPING_ADDRESS_UNSERVICEABLE",
              message: "Cannot ship to the selected address",
              intent: "SHIPPING_ADDRESS",
            };
          else {
            i.newShippingOptionParameters = {
              defaultSelectedOptionId: f,
              shippingOptions: h,
            };
            let e = i.newShippingOptionParameters.defaultSelectedOptionId;
            i.newTransactionInfo = D(e);
          }
        else
          "SHIPPING_OPTION" == e.callbackTrigger &&
            (i.newTransactionInfo = D(o.id));
        t(i);
      });
    }
    function D(e) {
      let t = A(e),
        a = m[e];
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
    (P.transactionInfo = A()), (y = S()), y.loadPaymentData(P);
  });
}
document.addEventListener(
  "DOMContentLoaded",
  function() {
    launchGooglePay();
  },
  !1
);
