"use strict";
var ckoIsSet = !1,
  ckoIsSetId = document.getElementById("default_thumb");
function getCardsList(e) {
  const a = new XMLHttpRequest();
  a.open("POST", e),
    (a.onload = function () {
      if (200 === this.status) {
        var e = JSON.parse(this.response.replace(/&quot;/g, '"'));
        e.length > 0 && $('[id="ckoCardSelector"]').show();
        for (var a = 0; a < e.length; a++)
          e[a].cardNumber &&
            $('[id="ckoCreditCardList"]').append(
              $("<option/>", { value: e[a].cardId, text: e[a].cardNumber })
            );
      }
    }),
    a.send();
}
function getCardData(e, a) {
  var r = e.options[e.selectedIndex].value;
  if (0 !== r.length) {
    const e = new XMLHttpRequest();
    e.open("POST", a),
      (e.onload = function () {
        if (200 === this.status)
          for (
            var e = JSON.parse(this.response.replace(/&quot;/g, '"')), a = 0;
            a < e.length;
            a++
          )
            if (e[a].cardId === r)
              return void setFields({
                cardId: e[a].cardId,
                cardNumber: e[a].cardNumber,
                cardType: e[a].cardType,
                cardHolder: e[a].cardHolder,
                cardType: e[a].cardType,
                cardToken: e[a].cardToken,
                expiryMonth: e[a].expiryMonth,
                expiryYear: e[a].expiryYear,
              });
      }),
      e.send();
  }
}
function setFields(e) {
  var a = $('[data-method="CREDIT_CARD"]');
  a.find('input[name$="_cardPaymentForm_owner"]').val(e.cardHolder),
  a.find('input[name$="_cardPaymentForm_number"]').val(e.cardNumber);
  a.find('input[name$="_cardPaymentForm_cardToken"]').val(e.cardToken),
  setSchema("#dwfrm_cardPaymentForm_number", e.cardType),
  a.find('[name$="_month"]').val(e.expiryMonth),
  a.find('[name$="_year"]').val(e.expiryYear),
  a.find('[name$="_type"]').val(e.cardType),
  a.find('[name$="_saveCard"]').click(),
  a.find('[name$="_saveCard"]').attr("disabled", "true"),
  a.find('input[name$="_cvn"]').val("");
}
function setSchema(e, a) {
    "mada" === a ||
    "Cartes Bancaires" === a ||
    "Visa" === a ||
    "Master Card" === a
    ? setImage(getImageId(a))
    : new Cleave(e, {
        creditCard: !0,
        onCreditCardTypeChanged: function (e) {
          var a = getImageId(e);
          if (a) {
            var r = {
              visa: "Visa",
              mastercard: "Master Card",
              amex: "Amex",
              discover: "Discover",
              unknown: "Unknown",
            }[e];
            $(".card-number-wrapper").attr("data-type", e),
              "visa" === e || "mastercard" === e || "discover" === e
                ? $("#securityCode").attr("maxlength", 3)
                : $("#securityCode").attr("maxlength", 4),
              (ckoIsSet = !0);
            var t = document.getElementById("dwfrm_cardPaymentForm_type");
            t && (t.value = r), setImage(a);
          } else setImage("default_thumb");
        },
      });
}
function setImage(e) {
  if (jQuery('[id="ckoSiteCountry"]').val() == 'FR' && jQuery('[id="ckoABCorNASEnabled"]').val() == 'NAS') {
    $("#dw_cardTypeDone").removeClass("cartes-bancaires-cartTypeDone");
    $("#dw_cardTypeDone").find('img[style="display: block;"]').css("display","none");
    $(".cartes-bancaires-options").css("display","none");
    if (document.getElementById("dw_cardTypeDone").querySelector('.selected')) {
      ckoIsSetId = document.getElementById("dw_cardTypeDone").querySelector('.selected');
    } else {
      ckoIsSetId = document.getElementById("default_thumb");
    }
    var a = document.getElementById(e);
    ckoIsSetId
      ? ((ckoIsSetId.style.display = "none", ckoIsSetId.classList.remove('selected')),
        (a.style.display = "block"),
        a.className = a.className + ' selected',
        (ckoIsSetId = a))
      : ((a.style.display = "block"), (ckoIsSetId = a));
    return;
  }
  var a = document.getElementById(e);
  ckoIsSetId
    ? ((ckoIsSetId.style.display = "none"),
      (a.style.display = "block"),
      (ckoIsSetId = a))
    : ((a.style.display = "block"), (ckoIsSetId = a));
}
function getImageId(e) {
  switch (e) {
    case "visa":
      return "visacard_thumb";
    case "mastercard":
      return "mastercard_thumb";
    case "amex":
      return "amexcard_thumb";
    case "discover":
      return "discovercard_thumb";
    case "jcb":
      return "jcbcard_thumb";
    case "diners":
      return "dinersclub_thumb";
    case "mada":
      return "madacard_thumb";
    case "Cartes Bancaires":
      return "cartesbancaires_thumb";
    case "Visa":
      return "visacard_thumb";
    case "Master Card":
      return "mastercard_thumb";      
    default:
      return !1;
  }
}
document.addEventListener(
  "DOMContentLoaded",
  function () {
    var e = $('[id="ckoCardListUrl"]').val();
    e && getCardsList(e);
  },
  !1
);
