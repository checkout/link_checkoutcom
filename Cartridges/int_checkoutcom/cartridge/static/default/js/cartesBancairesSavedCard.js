$(document).ready( function () {
    if ($("#ckoSiteCountry").val() === 'FR' && $("#ckoABCorNASEnabled").val() === 'NAS') {
        if ($("#CreditCardForm").parent().hasClass("primary-content")) {
          $(".cartes-bancaires-options").parent().addClass("save-card-no-dialog");
          $("#dw_cardTypeDone").addClass("CartesBancairesAdd").hide().clone().appendTo($('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').parent());
          $(".cartes-bancaires-options").addClass("cb-options-error").css("display","none").clone().appendTo($('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').parent());
          $(".tooltip-wrapper").addClass("tooltip-wrapper-error").clone().appendTo($('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').parent());
          $('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').parent().css("position","relative").find("#dw_cardTypeDone").show();
          $(".cartes-bancaires-options")[1].remove();
          $(".tooltip-wrapper")[1].remove();
        } else {
          $(".cartes-bancaires-options").parent().addClass("save-card-dialog");
          $("#dw_cardTypeDone").addClass("CartesBancairesAddDialog");
        }

        $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").parent().parent().hide();
        var e = 'input[name^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]';
        if($('input[name^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').length){    
            new Cleave(e,{
                creditCard: true,
                onCreditCardTypeChanged: function (e) {
                    var a = getImage(e);
                    $("#dw_cardTypeDone").find(".selected").removeClass("selected");
                    $("#"+a).addClass('selected');
                }
            });
        }

        $('input[name^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').on('input', function () {
            var cardNumber = $(this).val().replace(" ","");
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
                            cartesBancairesOptions.css("display", "flex");
                            cartesBancairesOptions.html("");
                            
                            if ("scheme_local" in response && "scheme" in response) {
                                cartesBancairesOptions.parent().removeClass("card-number-static-position");
                                cartesBancairesOptions.parent().css("position", "relative");
                                $("#dw_cardTypeDone").css("display","none");
                                if (response.scheme_local === "cartes_bancaires") {
                                  $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Cartes Bancaires");
                                  $(".card-number-wrapper").addClass("card-cartes-bancaires-wrapper");
                                  $("#cardType").val("Cartes Bancaires");
                                  $(".cartes-bancaires-options").css("width", "47px");
                                  var div = $("<div>").addClass("cartes-bancaires-wrapper");
                                  var span1 = $("<span>").addClass("cartes-bancaires-icon");
                                  div.append(span1);
                                  cartesBancairesOptions.append(div);
              
                                  if (response.scheme === 'cartes_bancaires') {
                                    $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Cartes Bancaires");
                                    $(".tooltip-info-wrapper").addClass("cb-toolip");
                                    $(".cartes-bancaires-options").addClass("cb-option");
                                  }
                                  if (response.scheme === "visa" || response.scheme === "mastercard") {
                                    $(".tooltip-info-wrapper").removeClass("cb-toolip");
                                    $(".cartes-bancaires-options").removeClass("cb-option");
                                    $(".tooltip-info-wrapper").css("display","block");
                                    $('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').addClass("cb-card-label");
                                    $(".cb-info-icon").hover(function(){
                                      $( '.cb-tooltip' ).each(function () {
                                        this.style.setProperty( 'display', 'block', 'important' );
                                      });
                                      }, function(){
                                        $( '.cb-tooltip' ).each(function () {
                                          this.style.setProperty( 'display', 'none', 'important' );
                                      });
                                    });
                                    
                                    $(".cartes-bancaires-options").css("width", "");
                                    $(".cartes-bancaires-wrapper").addClass("selected");
                                    var span1 = $("<span>").addClass("bancaires-check fa fa-check checked");
                                    $(".cartes-bancaires-wrapper").append(span1);
              
                                    $(".cartes-bancaires-wrapper").click(function () {
                                        $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Cartes Bancaires");
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
                                        $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Visa");
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
                                        $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Master Card");
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
                                  $(".tooltip-info-wrapper").css("display","none");
                                  $('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').removeClass("cb-card-label");
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
                              } else {
                                $(".tooltip-info-wrapper").css("display","none");
                                $('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').removeClass("cb-card-label");
                                cartesBancairesOptions.parent().addClass("card-number-static-position");
                                cartesBancairesOptions.css("display", "none");
                                $("#dw_cardTypeDone").css("display","block");
                            }
                        }
                    });
                }
            } else {
              $(".tooltip-info-wrapper").css("display","none");
              $('label[for^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').removeClass("cb-card-label");
              $("#ckoCartesBancaireBin").val("");
              var cartesBancairesOptions = $(".cartes-bancaires-options");
              cartesBancairesOptions.parent().addClass("card-number-static-position");
              cartesBancairesOptions.css("display", "none");
              cartesBancairesOptions.html("");
              $(".card-number-wrapper").removeClass("card-cartes-bancaires-wrapper");
              jQuery(".cartes-bancaires-options").css("display", "none");
            }
        });
    };
});

function getImage(e) {
    switch (e) {
        case "visa":
          $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Visa");
          return "visacard_thumb";
        case "mastercard":
            $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Master Card");
          return "mastercard_thumb";
        case "amex":
            $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Amex");
          return "amexcard_thumb";
        case "discover":
            $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Discover");
          return "discovercard_thumb";
        case "mada":
            $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("mada");
          return "madacard_thumb";
        case "cartesBancaires":
            $("#dwfrm_paymentinstruments_creditcards_newcreditcard_type").val("Cartes Bancaires");
          return "cartesbancaires_thumb";
        default:
          return !1;
      }
  };