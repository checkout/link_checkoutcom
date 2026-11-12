'use strict';

/**
 * Verifies the required information for the Checkout.com Flow billing form.
 *
 * Flow has no additional billing form fields: the payment details are collected
 * by the Checkout Web Components bundle on the Flow page, after the order has
 * been created, so nothing beyond the standard billing address is needed here.
 * @param {Object} req The request object
 * @param {Object} paymentForm The payment form
 * @param {Object} viewFormData Object containing the billing form data
 * @returns {Object} An object holding error information or the payment information
 */
function processForm(req, paymentForm, viewFormData) {
    var viewData = viewFormData;

    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.htmlValue,
        htmlName: paymentForm.paymentMethod.htmlValue,
    };

    viewData.paymentInformation = {};

    return {
        error: false,
        viewData: viewData,
    };
}

exports.processForm = processForm;
