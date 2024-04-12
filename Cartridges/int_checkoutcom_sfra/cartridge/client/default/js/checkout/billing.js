'use strict';

var base = require('base/checkout/billing');

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

module.exports = base;
