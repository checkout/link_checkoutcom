'use strict';

var base = require('base/checkout/billing');
var klarna = require('../klarna');

/**
 * returns the payment method name
 * @param {Object} applicablePaymentMethods - applicable payment methods
 * @param {Object} selectedPaymentMethod - selected payment method
 * @returns {string} paymentMethodName - payment method name
 */
function getPaymentMethodName(applicablePaymentMethods, selectedPaymentMethod) {
    var paymentMethodName;
    for (var i = 0; i < applicablePaymentMethods.length; i += 1) {
        if (applicablePaymentMethods[i].ID === selectedPaymentMethod) {
            paymentMethodName = applicablePaymentMethods[i].name;
            break;
        }
    }
    return paymentMethodName;
}


/**
 * Updates the payment information in checkout, based on the supplied order model
 * @param {Object} order - checkout model to use as basis of new truth
 */
base.methods.updatePaymentInformation = function(order) {
    // update payment details
    var $paymentSummary = $('.payment-details');
    var htmlToAppend = '';
    var selectedPaymentInstrument;

    if (order.billing.payment && order.billing.payment.selectedPaymentInstruments
        && order.billing.payment.selectedPaymentInstruments.length > 0) {
        for (var i = 0; i < order.billing.payment.selectedPaymentInstruments.length; i += 1) {
            selectedPaymentInstrument = order.billing.payment.selectedPaymentInstruments[i];
        }
        // CREDIT_CARD
        if (selectedPaymentInstrument.paymentMethod === 'CREDIT_CARD') {
            htmlToAppend += '<span>' + order.resources.cardType + ' ' + selectedPaymentInstrument.type + '</span><div>' + selectedPaymentInstrument.maskedCreditCardNumber
             + '</div><div><span>' + order.resources.cardEnding + ' ' + selectedPaymentInstrument.expirationMonth + '/' + selectedPaymentInstrument.expirationYear + '</span></div>';
        } else {
            htmlToAppend += '<div><p>' + getPaymentMethodName(order.billing.payment.applicablePaymentMethods, selectedPaymentInstrument.paymentMethod) + '</p>'
            + '<p>' + order.priceTotal + '</p></div>';
        }
    }

    $paymentSummary.empty().append(htmlToAppend);
};

base.selectBillingAddress = function() {
    $('.payment-form .addressSelector').on('change', function() {
        var form = $(this).parents('form')[0];
        var selectedOption = $('option:selected', this);
        var optionID = selectedOption[0].value;

        if (optionID === 'new') {
            // Show Address
            $(form).attr('data-address-mode', 'new');
        } else {
            // Hide Address
            $(form).attr('data-address-mode', 'shipment');
        }

        // Copy fields
        var attrs = selectedOption.data();
        var element;

        // Customize Klarna to reload the widget
        // whenever the billing country changes through the address selector dropdown.

        var initKlarna = false;
        if (attrs.countryCode !== $('#billingCountry').val()) {
            initKlarna = true;
        }

        Object.keys(attrs).forEach(function(attr) {
            element = attr === 'countryCode' ? 'country' : attr;
            if (element === 'cardNumber') {
                $('.cardNumber').data('cleave').setRawValue(attrs[attr]);
            } else {
                $('[name$=' + element + ']', form).val(attrs[attr]);
            }
        });

        if (initKlarna) {
            klarna.initializeKlarna($('#billingCountry').val());
        }
    });
};

module.exports = base;
