'use strict';

/**
 * Verifies the required information for the Sequra billing form is provided.
 * Stores the selected product type in session.privacy for use in Authorize.
 * @param {Object} req - the request
 * @param {Object} paymentForm - the payment form (pdict.forms.billingForm)
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    var viewData = viewFormData;

    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.htmlValue,
        htmlName: paymentForm.paymentMethod.htmlValue,
    };

    viewData.paymentInformation = {};

    // Save dropdown selection so Authorize can use it
    session.privacy.ckoSequraProductType = paymentForm.sequraForm.ckoSequraProduct.htmlValue;

    return {
        error: false,
        viewData: viewData,
    };
}

exports.processForm = processForm;
