!(function (e) {
  var t = {};
  function r(n) {
    if (t[n]) return t[n].exports;
    var a = (t[n] = { i: n, l: !1, exports: {} });
    return e[n].call(a.exports, a, a.exports, r), (a.l = !0), a.exports;
  }
  (r.m = e),
    (r.c = t),
    (r.d = function (e, t, n) {
      r.o(e, t) || Object.defineProperty(e, t, { enumerable: !0, get: n });
    }),
    (r.r = function (e) {
      "undefined" != typeof Symbol &&
        Symbol.toStringTag &&
        Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }),
        Object.defineProperty(e, "__esModule", { value: !0 });
    }),
    (r.t = function (e, t) {
      if ((1 & t && (e = r(e)), 8 & t)) return e;
      if (4 & t && "object" == typeof e && e && e.__esModule) return e;
      var n = Object.create(null);
      if (
        (r.r(n),
        Object.defineProperty(n, "default", { enumerable: !0, value: e }),
        2 & t && "string" != typeof e)
      )
        for (var a in e)
          r.d(
            n,
            a,
            function (t) {
              return e[t];
            }.bind(null, a)
          );
      return n;
    }),
    (r.n = function (e) {
      var t =
        e && e.__esModule
          ? function () {
              return e.default;
            }
          : function () {
              return e;
            };
      return r.d(t, "a", t), t;
    }),
    (r.o = function (e, t) {
      return Object.prototype.hasOwnProperty.call(e, t);
    }),
    (r.p = ""),
    r((r.s = 14));
})({
  14: function (e, t, r) {
    "use strict";
    var n = !1,
      a = document.getElementById("default_thumb");
    document.addEventListener("DOMContentLoaded", function () {
      $('input[name="dwfrm_cardPaymentForm_owner"]').attr("maxlength", "48"),
        u(),
        c("#dwfrm_cardPaymentForm_number"),
        l(),
        s(),
        getCartesBancaire(),
        o(),
        d();
    });
    var d = function () {
        $("#dwfrm_cardPaymentForm_owner").val(""), $(".cvn :input").val("");
      },
      u = function () {
        $("#dwfrm_cardPaymentForm_number").css("padding", "0"),
          $("#dwfrm_cardPaymentForm_number").css("padding-left", "5px");
        var e = document.getElementById("dw_cardTypeDone"),
          t = document.getElementById("dwfrm_cardPaymentForm_number");
        t && $(t.parentNode).prepend(e);
      },
      o = function () {
        for (var e = new Date().getFullYear(), t = 0; t < 10; t++)
          $("#dwfrm_cardPaymentForm_expiration_year").append(
            new Option(e + t, e + t)
          );
      },
      c = function (e) {
        new Cleave(e, {
          creditCard: !0,
          onCreditCardTypeChanged: function (e) {
            var t = i(e);
            if (t) {
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
                (n = !0);
              var a = document.getElementById("dwfrm_cardPaymentForm_type");
              a && (a.value = r), m(t);
            } else m("default_thumb");
          },
        });
      },
      m = function (e) {
        var t = document.getElementById(e);
        a
          ? ((a.style.display = "none"), (t.style.display = "block"), (a = t))
          : ((t.style.display = "block"), (a = t));
      },
      i = function (e) {
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
            return "cartesbancaires_thumb";
          default:
            return !1;
        }
      },
      s = function () {
        var e = document.getElementById("dwfrm_cardPaymentForm_mada"),
          t = document.getElementById("dwfrm_cardPaymentForm_number");
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
                var r = document.getElementById("dwfrm_cardPaymentForm_type");
                r && (r.value = t);
                var a = i(t);
                m(a);
              } else n || m("default_thumb");
            } else e.length < 6 && (n || m("default_thumb"));
          });
      },
      getCartesBancaire = function() {
            if (jQuery('[id="ckoSiteCountry"]').val() == 'FR' && jQuery('[id="ckoABCorNASEnabled"]').val() == 'NAS') {
                var e = document.getElementById("dwfrm_cardPaymentForm_mada"),
                t = document.getElementById("dwfrm_cardPaymentForm_number");
                e && t.addEventListener("input", (function() {
                  if ($("#dw_cardTypeDone").find('.selected').length > 0) {
                    var activeThumb = $("#dw_cardTypeDone").find('.selected')
                    activeThumb.css("display","none");
                    activeThumb.removeClass('selected');
                  }
                    var e = this.value;
                    if (e.length >= 7) {
                        var t = function(e) {
                            var n = e.substr(0, 6);
                            if (!n) {
                                return !1;
                            }
                            else {
                                var verifyCartesBancaireURL = document.getElementById("ckoVerifyCartesBinUrl").value;
                                if ($("#ckoCartesBancaireBin").val() === n) {
                                  return !1;
                                }
                                $("#ckoCartesBancaireBin").val(n);
                                var xhr = new XMLHttpRequest;
                                
                                xhr.onreadystatechange = function() {
                                    if (4 === this.readyState && 200 === this.status) {
                                        var result = JSON.parse(this.responseText);
                                        var response = result.res;
                                        var cartesBancairesOptions = $(".cartes-bancaires-options");
                                        cartesBancairesOptions.parent().css("position","relative");
                                        cartesBancairesOptions.css("display", "flex");
                                        cartesBancairesOptions.html("");
                                        if ('scheme_local' in response && response.scheme_local === 'cartes_bancaires') {
                                          $("#dw_cardTypeDone").addClass("cartes-bancaires-cartTypeDone");
                                            $("#dwfrm_cardPaymentForm_type").val("Cartes Bancaires");
                                            var div = $("<div>").addClass("cartes-bancaires-wrapper");
                                            var span1 = $("<span>").addClass("cartes-bancaires-icon");
                                            div.append(span1);
                                            cartesBancairesOptions.append(div);

                                            if ('scheme' in response && (response.scheme === 'visa' || response.scheme === 'mastercard')) {
                                              !($("label[for='dwfrm_cardPaymentForm_number']").hasClass("cb-card-label")) ? $("label[for='dwfrm_cardPaymentForm_number']").addClass("cb-card-label").append($(".tooltip-wrapper").html()) : '';
                                              $(".cb-info-icon").hover(function() {
                                                $( '.cb-tooltip' ).each(function () {
                                                  this.style.setProperty( 'display', 'block', 'important' );
                                                });
                                                }, function() {
                                                  $( '.cb-tooltip' ).each(function () {
                                                    this.style.setProperty( 'display', 'none', 'important' );
                                                });
                                              });
                                              $(".tooltip-info-wrapper")[0].style.display = 'block';
                                              $(".cartes-bancaires-wrapper").addClass("selected");
                                              var span2 = $("<span>").addClass("fa fa-check bancaires-check");
                                              div.append(span2);
                                              $(".cartes-bancaires-wrapper").click(function() {
                                                $("#dwfrm_cardPaymentForm_type").val("Cartes Bancaires");
                                                $(".cartes-bancaires-options").find('.selected').find(".fa").css("display","none");
                                                $(".cartes-bancaires-options").find('.selected').removeClass("selected");
                                                $(this).addClass("selected");
                                                $(this).find('.fa').css("display","block");
                                              });
                                            }
                                        } else {
                                          $(".tooltip-info-wrapper")[0].style.display = 'none';
                                          $("#dw_cardTypeDone").removeClass("cartes-bancaires-cartTypeDone");
                                          $("label[for='dwfrm_cardPaymentForm_number']").removeClass("cb-card-label");
                                          $("label[for='dwfrm_cardPaymentForm_number']").find(".tooltip-info-wrapper").remove();
                                        }
                                        if (('scheme_local' in response && response.scheme_local === 'cartes_bancaires') && ('scheme' in response && response.scheme === 'visa')) {
                                            var div = $("<div>").addClass("cartes-visa-wrapper");
                                            var span1 = $("<span>").addClass("cartes-visa-icon");
                                            var span2 = $("<span>").addClass("fa fa-check visa-check");
                                            div.append(span1);
                                            div.append(span2);
                                            cartesBancairesOptions.append(div);

                                            $(".cartes-visa-wrapper").click(function() { 
                                                $("#dwfrm_cardPaymentForm_type").val("Visa");
                                                $(".cartes-bancaires-options").find('.selected').find(".fa").css("display","none");
                                                $(".cartes-bancaires-options").find('.selected').removeClass("selected");
                                                $(this).addClass("selected");
                                                $(this).find('.fa').css("display","block");
                                            });
                                        }
                                        if (('scheme_local' in response && response.scheme_local === 'cartes_bancaires') && ('scheme' in response && response.scheme === 'mastercard')) {                                         
                                            var div = $("<div>").addClass("cartes-mastercard-wrapper");
                                            var span1 = $("<span>").addClass("cartes-mastercard-icon");
                                            var span2 = $("<span>").addClass("fa fa-check mastercard-check");
                                            div.append(span1);
                                            div.append(span2);
                                            cartesBancairesOptions.append(div);

                                            $(".cartes-mastercard-wrapper").click(function() {
                                                $("#dwfrm_cardPaymentForm_type").val("Master Card");
                                                $(".cartes-bancaires-options").find('.selected').find(".fa").css("display","none");
                                                $(".cartes-bancaires-options").find('.selected').removeClass("selected");
                                                $(this).addClass("selected");
                                                $(this).find('.fa').css("display","block");
                                            });
                                        }
                                    }
                                },xhr.open("POST", verifyCartesBancaireURL, !0),
                                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded"), xhr.send("cardBin="+n);
                            }
                        }(e.replace(/\s/g, "").slice(0, 6));
                    } else {
                      $(".tooltip-info-wrapper")[0].style.display = 'none';
                      $("label[for='dwfrm_cardPaymentForm_number']").removeClass("cb-card-label");
                      $("label[for='dwfrm_cardPaymentForm_number']").find(".tooltip-info-wrapper").remove();
                        $("#ckoCartesBancaireBin").val("");
                        var cartesBancairesOptions = $(".cartes-bancaires-options");
                        cartesBancairesOptions.css("display","none");
                        $("#dw_cardTypeDone").removeClass("cartes-bancaires-cartTypeDone");
                        cartesBancairesOptions.html("");
                        jQuery('.cartes-bancaires-options').css("display","none");
                        return e.length < 6 && (n || m("default_thumb"))
                    }
                }))
            }
      },
      l = function () {
        if (document.getElementById("dwfrm_cardPaymentForm_mada")) {
          var e = document.getElementById("ckoMadaBinUrl").value,
            t = new XMLHttpRequest();
          (t.onreadystatechange = function () {
            if (4 === this.readyState && 200 === this.status) {
              var e = this.responseText;
              window.sessionStorage.setItem("madaBinsConfig", e);
            }
          }),
            t.open("GET", e, !0),
            t.send();
        }
      };
  }
});
