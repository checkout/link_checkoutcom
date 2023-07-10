"use strict";
function initCheckoutcomCardValidation() {
  var a =
      "CREDIT_CARD" === $('input[name="dwfrm_billing_paymentMethod"]').val(),
    r = $(".saved-card-tab").hasClass("active");
  a && !r ? cardFormValidation() : a && r && savedCardFormValidation();
}
function cardFormValidation() {
  $("button.submit-payment")
    .off("click touch")
    .on("click touch", function (a) {
      resetFormErrors();
      var r = [];
      r.push(checkCardNumber()),
        r.push(checkCardExpirationMonth()),
        r.push(checkCardExpirationYear()),
        r.push(checkCardCvv()),
        $.each(r, function (r, e) {
          e &&
            1 === e.error &&
            (a.preventDefault(),
            a.stopImmediatePropagation(),
            $("#" + e.id)
              .next(".invalid-feedback")
              .show());
        });
    });
}
function checkCardNumber() {
  var a = $("#cardNumber"),
    r = { id: a.attr("id"), error: 0 };
  return (
    getFormattedNumber(a.val()).length < 16 &&
      ($(
        ".dwfrm_billing_creditCardFields_cardNumber .invalid-field-message"
      ).text(window.ckoLang.cardNumberInvalid),
      a.addClass("is-invalid"),
      (r.error = 1)),
    r
  );
}
function checkCardExpirationMonth() {
  var a = $("#expirationMonth"),
    r = { id: a.attr("id"), error: 0 };
  return (
    ("" === a.val() ||
      ($("#expirationYear").val() == new Date().getFullYear() &&
        a.val() < new Date().getMonth() + 1)) &&
      ($(
        ".dwfrm_billing_creditCardFields_expirationMonth .invalid-field-message"
      ).text(window.ckoLang.cardExpirationMonthInvalid),
      a.addClass("is-invalid"),
      (r.error = 1)),
    r
  );
}
function checkCardExpirationYear() {
  var a = $("#expirationYear"),
    r = { id: a.attr("id"), error: 0 };
  return (
    "" === a.val() &&
      ($(
        ".dwfrm_billing_creditCardFields_expirationYear .invalid-field-message"
      ).text(window.ckoLang.cardExpirationYearInvalid),
      a.addClass("is-invalid"),
      (r.error = 1)),
    r
  );
}
function checkCardCvv() {
  var a = $("#securityCode"),
    r = { id: a.attr("id"), error: 0 };
  return (
    (a.val().length < 3 || a.val().length > 4) &&
      ($(
        ".dwfrm_billing_creditCardFields_securityCode .invalid-field-message"
      ).text(window.ckoLang.cardSecurityCodeInvalid),
      a.addClass("is-invalid"),
      (r.error = 1)),
    r
  );
}
function getFormattedNumber(a) {
  return a.replace(/\s/g, "");
}
function savedCardFormValidation() {
  savedCardSelection(),
    $("button.submit-payment")
      .off("click touch")
      .one("click touch", function (a) {
        resetFormErrors();
        var r = $(".saved-payment-instrument"),
          e = a;
        r.each(function (a) {
          var r = $(this),
            i = r.find("input.saved-payment-security-code"),
            t = r.hasClass("selected-payment"),
            n = "" === i.val(),
            d = i.val() % 1 == 0;
          !t ||
            (!n && d) ||
            (e.preventDefault(),
            e.stopImmediatePropagation(),
            r.find(".invalid-feedback").show());
        });
      });
}
