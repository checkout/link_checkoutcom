"use strict";
document.addEventListener(
  "DOMContentLoaded",
  function() {
    $("body").on("click", function(e) {
      -1 !==
        e.target.className.toString().indexOf("minicart-google-pay-button") &&
        (function() {
          var e = $.trim($(".sub-total")
              .text()
              .replace(/[^\d\.\,\s]+/g, "")
              .replaceAll(",", "")),
            t =
              $.trim($(".tax-total")
                .text()
                .replace(/[^\d\.\,\s]+/g, "")
                .replaceAll(",", "")) ||
                $.trim(jQuery('[id="ckoMiniCartSalesTax"]')
                .val()
                .replaceAll(",", ""));
          const a = { apiVersion: 2, apiVersionMinor: 0 },
            n = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"],
            o = ["PAN_ONLY", "CRYPTOGRAM_3DS"],
            i = {
              type: "PAYMENT_GATEWAY",
              parameters: {
                gateway: "checkoutltd",
                gatewayMerchantId: jQuery(
                  '[id="ckoMiniCartGatewayMerchantId"]'
                ).val(),
              },
            },
            r = {
              type: "CARD",
              parameters: { allowedAuthMethods: o, allowedCardNetworks: n },
            },
            s = {
              type: "TOKENIZED_CARD",
              parameters: { allowedAuthMethods: o, allowedCardNetworks: n },
            },
            c = Object.assign({}, r, { tokenizationSpecification: i }),
            l = Object.assign({}, s, { tokenizationSpecification: i });
          var d;
          let p = null;
          var u,
            g,
            y,
            m,
            h = { price: e };
          $.ajax({
            url: document.getElementById("ckoMiniCartGetShippingMethods").value,
            data: h,
            method: "POST",
            success: function(e) {
              (u = e.shipMethods),
                (g = e.shipCosts),
                (y = e.salesTax),
                (d = e.discounts);
            },
            error: function(e) {
              console.log(e);
            },
          }),
            I()
              .isReadyToPay(
                Object.assign({}, a, { allowedPaymentMethods: [c, l] })
              )
              .then(function(e) {
                e.result &&
                  (function() {
                    var e = S();
                    (e.transactionInfo = {
                      totalPriceStatus: "NOT_CURRENTLY_KNOWN",
                      currencyCode: jQuery(
                        '[id="ckoMiniCartGooglePayCurrency"]'
                      ).val(),
                    }),
                      I().prefetchPaymentData(e);
                  })();
              })
              .catch(function(e) {
                console.log(e);
              });
          var f = S();
          function I() {
            return (
              null === p &&
                (p = new google.payments.api.PaymentsClient({
                  environment: "TEST",
                  merchantInfo: {
                    merchantName: "Example Merchant",
                    merchantId: jQuery(
                      '[id="ckoMiniCartGooglePayMerchantId"]'
                    ).val(),
                  },
                  paymentDataCallbacks: {
                    onPaymentAuthorized: N,
                    onPaymentDataChanged: A,
                  },
                })),
              p
            );
          }
          function S() {
            const e = Object.assign({}, a);
            return (
              (e.allowedPaymentMethods = [c]),
              (e.transactionInfo = P()),
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
          function P(a) {
            if (a)
              var n = y[a],
                o = "-" + d[a];
            var i = {
              displayItems: [
                { label: "Subtotal", type: "SUBTOTAL", price: e },
                { label: "Tax", type: "TAX", price: n || t },
              ],
              currencyCode: jQuery('[id="ckoMiniCartGooglePayCurrency"]').val(),
              totalPriceStatus: "FINAL",
              totalPrice: e,
              totalPriceLabel: "Total",
            };
            if (a && parseFloat(d[a]) > 0) {
              var r = {
                label: "Discounts",
                type: "DISCOUNT",
                price: o || "0.00",
              };
              i.displayItems.push(r);
            }
            return i;
          }
          function N(e) {
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
                    jQuery("#ckoMiniCartGooglePayData").val(JSON.stringify(a));
                    var i = {
                      ckoGooglePayData: JSON.stringify(a),
                      shippingAddress: JSON.stringify(n),
                      shippingMethod: JSON.stringify(o),
                      pid: "null",
                      email: e.email,
                    };
                    "" ===
                    $(
                      'input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]'
                    ).val()
                      ? $(
                          "#mini-cart-google-pay-content .invalid-field-message"
                        ).text(window.ckoLang.googlePayDataInvalid)
                      : $.ajax({
                          url: document.getElementById(
                            "ckoMiniCartGooglePayExpressCheckout"
                          ).value,
                          data: i,
                          method: "POST",
                          success: function(e) {
                            e.error
                              ? jQuery(".minicart-google-pay-error").show(
                                  "fast",
                                  function() {
                                    setTimeout(function() {
                                      jQuery(".minicart-google-pay-error").hide(
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
          function A(e) {
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
                  url: document.getElementById("ckoMiniCartGetShippingMethods").value,
                  success: function(e) {
                    (g = e.shipCosts),
                      (u = e.shipMethods),
                      (y = e.salesTax),
                      (d = e.discounts);
                    var t = !1;
                    (m = e.defaultShippingMethod) in g && (t = !0),
                      t || (m = Object.keys(g)[0]);
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
                    defaultSelectedOptionId: m,
                    shippingOptions: u,
                  };
                  let e = i.newShippingOptionParameters.defaultSelectedOptionId;
                  i.newTransactionInfo = O(e);
                }
              else
                "SHIPPING_OPTION" == e.callbackTrigger &&
                  (i.newTransactionInfo = O(o.id));
              t(i);
            });
          }
          function O(e) {
            let t = P(e),
              a = g[e];
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
          (f.transactionInfo = P()), (p = I()), p.loadPaymentData(f);
        })();
    });
  },
  !1
);
