"use strict";function savedCardSelection(){var e=$(".saved-payment-instrument");e.off("click touch").one("click touch",function(e){var a=$(this);$('input[name="dwfrm_billing_savedCardForm_selectedCardUuid"]').val(a.data("uuid")),a.find("input.saved-payment-security-code").off("change").one("change",function(e){$('input[name="dwfrm_billing_savedCardForm_selectedCardCvv"]').val($(this).val())})}),e.first().addClass("selected-payment")}