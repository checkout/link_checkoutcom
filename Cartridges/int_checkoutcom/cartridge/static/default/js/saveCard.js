$(document).ready( function () {
    var e = 'input[name^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]';
    if($('input[name^="dwfrm_paymentinstruments_creditcards_newcreditcard_number_"]').length){    
        new Cleave(e,{
            creditCard: true
        });
    }
});