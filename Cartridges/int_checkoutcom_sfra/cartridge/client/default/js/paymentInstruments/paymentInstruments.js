'use strict';

var formValidation = require('base/components/formValidation');
var cleave = require('base/components/cleave');

var url;

module.exports = {
    removePayment: function () {
        $('.remove-payment').on('click', function (e) {
            e.preventDefault();
            url = $(this).data('url') + '?UUID=' + $(this).data('id');
            $('.payment-to-remove').empty().append($(this).data('card'));

            $('.delete-confirmation-btn').click(function (f) {
                f.preventDefault();
                $('.remove-payment').trigger('payment:remove', f);
                $.ajax({
                    url: url,
                    type: 'get',
                    dataType: 'json',
                    success: function (data) {
                        $('#uuid-' + data.UUID).remove();
                        if (data.message) {
                            var toInsert = '<div class="row justify-content-center h3 no-saved-payments"><p>' +
                            data.message +
                            '</p></div>';
                            $('.paymentInstruments').empty().append(toInsert);
                        }
                    },
                    error: function (err) {
                        if (err.responseJSON.redirectUrl) {
                            window.location.href = err.responseJSON.redirectUrl;
                        }
                        $.spinner().stop();
                    }
                });
            });
        });
    },

    submitPayment: function () {
        $('form.payment-form').submit(function (e) {
            var $form = $(this);
            e.preventDefault();
            url = $form.attr('action');
            $form.spinner().start();
            $('form.payment-form').trigger('payment:submit', e);

            var formData = cleave.serializeData($form);

            $.ajax({
                url: url,
                type: 'post',
                dataType: 'json',
                data: formData,
                success: function (data) {
                    $form.spinner().stop();
                    if (!data.success) {
                        formValidation($form, data);
                    } else {
                        location.href = data.redirectUrl;
                    }
                },
                error: function (err) {
                    if (err.responseJSON.redirectUrl) {
                        window.location.href = err.responseJSON.redirectUrl;
                    }
                    $form.spinner().stop();
                }
            });
            return false;
        });
    },

    handleCreditCardNumber: function () {
        if ($('#cardNumber').length && $('#cardType').length) {
            cleave.handleCreditCardNumber('#cardNumber', '#cardType');
        }
    },

    getCartesBancaireOptions: function () {
        if ($("#ckoSiteCountry").val() === 'FR' && $("#ckoABCorNASEnabled").val() === 'NAS') {
            $("#cardNumber").siblings(".invalid-feedback").on("DOMSubtreeModified", function(){
                if ($(this).html().length > 0) {
                    $(".cartes-bancaires-options").addClass("invalid-card");
                } else {
                    $(".cartes-bancaires-options").removeClass("invalid-card");
                };
            });
            $("#cardNumber").on('input', function () {
                var cardNumber = $(this).val().replace(" ","");;
                if (cardNumber.length >= 6) {
                    var cardBin = cardNumber.substring(0,6);
                    if (!cardBin) {
                        return false;
                    } else {
                        if ($("#ckoCartesBancaireBin").val() === cardBin) {
                            return !1;
                        }
                        $("#ckoCartesBancaireBin").val(cardBin);
                        var form = {
                            cardBin: cardBin
                        };
                        var verifyCartesBancaireURL = $("#ckoVerifyCartesBinUrl").val();
                        $.ajax({
                            url: verifyCartesBancaireURL,
                            type: 'POST',
                            data: form,
                            dataType: 'json',
                            success: function (data) {
                                var response = data.res;
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
                        });
                    }
                } else {
                    $(".tooltip-wrapper").removeClass("cb-tooltip-wrapper");
                    $(".tooltip-info-wrapper").css("display","none");
                    $("#ckoCartesBancaireBin").val("");
                    var cartesBancairesOptions = $(".cartes-bancaires-options");
                    cartesBancairesOptions.css("display", "none");
                    cartesBancairesOptions.html("");
                    $(".card-number-wrapper").removeClass("card-cartes-bancaires-wrapper");
                    jQuery(".cartes-bancaires-options").css("display", "none");
                }
            });

        }
    },

    getMadaBins: function () {
        if ($("#cardType")) {
            var madaBinUrl = $("#ckoMadaBinUrl").val();
            $.ajax({
                url: madaBinUrl,
                type: 'get',
                success: function (data) {
                    var result = data;
                    window.sessionStorage.setItem("madaBinsConfig", JSON.stringify(result.madaBins));
                }
            });
        }
    },

    checkMadaCardType: function () {
        function checkMadaBin (cardNumber, madaBinConfigs) {
            var cardBinFirstNumber = cardNumber.charAt(0);
            var cardBin = cardNumber.substring(0,6);
            if (!cardBinFirstNumber) {
                return false;
            }
            switch (cardBinFirstNumber) {
                case '4':
                    if (madaBinConfigs.four.includes(cardBin)) return 'mada';
                    break;
                case '5':
                    if (madaBinConfigs.five.includes(cardBin)) return 'mada';
                    break;
                case '6':
                    if (madaBinConfigs.six.includes(cardBin)) return 'mada';
                    break;
                case '9':
                    if (madaBinConfigs.nine.includes(cardBin)) return 'mada';
                    break;
                default:
                    return false;
            }
        }
        var cardType = $("#cardType");
        var cardNumber = $("#cardNumber");

        if (cardType && cardNumber) {
            cardNumber.on('input', function () {
                var cardNumber = $(this).val().replace(/ /g, "");
                if (cardNumber.length > 7) {
                    var t = checkMadaBin(cardNumber, JSON.parse(window.sessionStorage.getItem("madaBinsConfig")));
                    if (t) {
                        $(".card-number-wrapper")[0].dataset.type = t;
                        $("#cardType").val(t);
                    }
                }
            });
        }
    }
};
 