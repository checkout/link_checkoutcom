"use strict";
function initTabs() {
  $(".payment-options a.nav-link").on("click touch", function () {
    $(".tab-pane").removeClass("active"),
      $("a.nav-link").removeClass("active"),
      handleSavedCardsDisplay();
    var a = $(this).attr("href");
    $(a).addClass("active"), $(this).addClass("active");
    var i = $(this).parents("li").data("method-id");
    $('input[name="dwfrm_billing_paymentMethod"]').val(i), initFormValidation();
  }),
    $(".payment-options li.nav-item")
      .first()
      .find("a.nav-link")
      .trigger("click");
}
function handleSavedCardsDisplay() {
  0 === $(".row.saved-payment-instrument").length &&
    ($(".saved-card-tab").closest("li").hide(),
    $(".tab-pane.saved-card-content").hide());
}
function initFormValidation() {
  for (
    var a = "",
      i = $('input[name="dwfrm_billing_paymentMethod"]')
        .val()
        .toLowerCase()
        .split("_"),
      n = 0;
    n < i.length;
    n++
  )
    a += i[n].charAt(0).toUpperCase() + i[n].slice(1);
  var t = "init" + a + "Validation";
  "function" == typeof window[t] && window[t]();
}
function resetFormErrors() {
  $(".invalid-feedback").hide(),
    $(".credit-card-content .is-invalid").each(function () {
      $(this).removeClass("is-invalid");
    });
}
function loadTranslations() {
  var a = $("#translationStrings").val();
  window.ckoLang = JSON.parse(a);
}

function s() {
    var e = document.getElementById("cardType"),
      t = document.getElementById("cardNumber");
    e &&
      t.addEventListener("input", function () {
        var e = this.value;
        if (e.length >= 7) {
          var t = (function (e, t) {
            var r = e.charAt(0),
              n = e.substr(0, 6);
            if (!r) return !1;
            switch (r) {
              case "4":
                if (t.four.includes(n)) return "mada";
                break;
              case "5":
                if (t.five.includes(n)) return "mada";
                break;
              case "6":
                if (t.six.includes(n)) return "mada";
                break;
              case "9":
                if (t.nine.includes(n)) return "mada";
                break;
              default:
                return !1;
            }
          })(
            e.replace(/\s/g, "").slice(0, 6),
            JSON.parse(window.sessionStorage.getItem("madaBinsConfig"))
          );
          if (t) {
            var r = document.getElementById("cardType");
            document.getElementsByClassName("card-number-wrapper")[0].dataset.type = t;
            r && (r.value = t);
          }
        }
      });
};

function getMadaBin () {
    if (document.getElementById("cardType")) {
      var e = document.getElementById("ckoMadaBinUrl").value,
        t = new XMLHttpRequest();
      (t.onreadystatechange = function () {
        if (4 === this.readyState && 200 === this.status) {
          var result = JSON.parse(this.responseText);
          window.sessionStorage.setItem("madaBinsConfig", JSON.stringify(result.madaBins));
        }
      }),
        t.open("GET", e, !0),
        t.send();
    }
};
function getCartesBancaire() {
  if (jQuery('[id="ckoSiteCountry"]').val() == "FR" && jQuery('[id="ckoABCorNASEnabled"]').val() == "NAS") {
    $("#cardNumberInvalidMessage").on("DOMSubtreeModified", function(){
      if ($(this).html().length > 0) {
        $(".cartes-bancaires-options").addClass("invalid-card");
      } else {
        $(".cartes-bancaires-options").removeClass("invalid-card");
      }
    });
    var t = document.getElementById("cardNumber");
    t.addEventListener("input", function () {
      $(".select-dropdown").find("option").remove();
      $(".select-dropdown").hide();
      var e = this.value;
      if (e.length >= 7) {
        var t = (function (e, t) {
          var n = e.substr(0, 6);
          if (!n) {
            return !1;
          } else {
            if ($("#ckoCartesBancaireBin").val() === n) {
              return !1;
            }
            $("#ckoCartesBancaireBin").val(n);
            var verifyCartesBancaireURL = document.getElementById("ckoVerifyCartesBinUrl").value;
            var xhr = new XMLHttpRequest();

            (xhr.onreadystatechange = function () {
              if (4 === this.readyState && 200 === this.status) {
                var result = JSON.parse(this.responseText);
                var response = result.res;
                var cartesBancairesOptions = $(".cartes-bancaires-options");
                cartesBancairesOptions.parent().css("position", "relative");
                cartesBancairesOptions.css("display", "flex");
                cartesBancairesOptions.html("");
                if ("scheme_local" in response && "scheme" in response) {
                  if (response.scheme_local === "cartes_bancaires") {
                    $(".card-number-wrapper").addClass("card-cartes-bancaires-wrapper");
                    $("#cardType").val("Cartes Bancaires");
                    $(".cartes-bancaires-options").css("width", "47px");
                    var div = $("<div>").addClass("cartes-bancaires-wrapper");
                    var span1 = $("<span>").addClass("cartes-bancaires-icon");
                    div.append(span1);
                    cartesBancairesOptions.append(div);

                    if (response.scheme === "visa" || response.scheme === "mastercard") {
                      $(".tooltip-wrapper").addClass("cb-tooltip-wrapper");
                      $(".tooltip-info-wrapper").css("display","flex");
                      $(".cartes-bancaires-options").css("width", "");
                      $(".cartes-bancaires-wrapper").addClass("selected");
                      var span1 = $("<span>").addClass("bancaires-check fa fa-check checked");
                      $(".cartes-bancaires-wrapper").append(span1);

                      $(".cartes-bancaires-wrapper").click(function () {
                        $("#cardType").val("Cartes Bancaires");
                        $(".cartes-bancaires-options").find(".selected").find(".checked").css("display", "none");
                        $(".cartes-bancaires-options").find(".selected").removeClass("selected");
                        $(this).addClass("selected");
                        $(this).find(".bancaires-check").css("display", "block");
                      });
                    }

                    if (response.scheme === "visa") {
                      var div = $("<div>").addClass("cartes-visa-wrapper");
                      var span1 = $("<span>").addClass("cartes-visa-icon");
                      var span2 = $("<span>").addClass("visa-check fa fa-check");
                      div.append(span1);
                      div.append(span2);
                      cartesBancairesOptions.append(div);

                      $(".cartes-visa-wrapper").click(function () {
                        $("#cardType").val("Visa");
                        $(".cartes-bancaires-options").find(".selected").find(".checked").css("display", "none");
                        $(".cartes-bancaires-options").find(".selected").removeClass("selected");
                        $(this).addClass("selected");
                        $(this).find(".visa-check").addClass("checked");
                        $(this).find(".visa-check").each(function () {
                          this.style.setProperty( 'display', 'block', 'important' );
                        });
                      });
                    }

                    if (response.scheme === "mastercard") {
                      var div = $("<div>").addClass("cartes-mastercard-wrapper");
                      var span1 = $("<span>").addClass("cartes-mastercard-icon");
                      var span2 = $("<span>").addClass("mastercard-check fa fa-check");
                      div.append(span1);
                      div.append(span2);
                      cartesBancairesOptions.append(div);

                      $(".cartes-mastercard-wrapper").click(function () {
                        $("#cardType").val("Master Card");
                        $(".cartes-bancaires-options").find(".selected").find(".checked").css("display", "none");
                        $(".cartes-bancaires-options").find(".selected").removeClass("selected");
                        $(this).addClass("selected");
                        $(this).find(".mastercard-check").addClass("checked");
                        $(this).find(".mastercard-check").each(function () {
                            this.style.setProperty( 'display', 'block', 'important' );
                          });
                      });
                    }
                  } else if ('scheme' in response) {
                    $(".tooltip-wrapper").removeClass("cb-tooltip-wrapper");
                    $(".tooltip-info-wrapper").css("display","none");
                    if (response.scheme === "visa") {
                      $("#cardType").val("Visa");
                      $(".card-number-wrapper").removeClass(
                        "card-cartes-bancaires-wrapper"
                      );
                    } else if (response.scheme === "mastercard") {
                      $("#cardType").val("Master Card");
                      $(".card-number-wrapper").removeClass(
                        "card-cartes-bancaires-wrapper"
                      );
                    }
                  }
                }
              }
            }),
              xhr.open("POST", verifyCartesBancaireURL, !0),
              xhr.setRequestHeader(
                "Content-Type",
                "application/x-www-form-urlencoded"
              ),
              xhr.send("cardBin=" + n);
          }
        })(e.replace(/\s/g, "").slice(0, 6));
      } else {
        $(".tooltip-wrapper").removeClass("cb-tooltip-wrapper");
        $(".tooltip-info-wrapper").css("display","none");
        $("#ckoCartesBancaireBin").val("");
        var cartesBancairesOptions = $(".cartes-bancaires-options");
        cartesBancairesOptions.css("display", "none");
        cartesBancairesOptions.html("");
        $(".card-number-wrapper").removeClass("card-cartes-bancaires-wrapper");
        jQuery(".cartes-bancaires-options").css("display", "none");
        return e.length < 6 && (n || m("default_thumb"));
      }
    });
  }
}

function getSchema(e) {
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
    case "cartesBancaires":
      return "jcbcard_thumb";
    default:
      return !1;
  }
}

document.addEventListener(
  "DOMContentLoaded",
  function () {
    loadTranslations(),
      initTabs(),
      getCartesBancaire(),
      getSchema(),
      getMadaBin(),
      s(),
      "payment" == $("#checkout-main").attr("data-checkout-stage")
        ? filterApm()
        : $(".submit-shipping").on("click", function () {
            $(function () {
              filterApm();
            });
          });
  },
  !0
);
