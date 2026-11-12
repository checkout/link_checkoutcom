'use strict';

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - the request
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    var viewData = viewFormData;
    var ckoPayPalData = paymentForm.payPalForm ? paymentForm.payPalForm.ckoPayPalData.htmlValue : null;
    var error = true;

    if (ckoPayPalData) {
        error = false;
        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.htmlValue,
            htmlName: paymentForm.paymentMethod.htmlValue,
        };

        viewData.paymentInformation = {
            ckoPayPalData: {
                value: ckoPayPalData,
                htmlName: ckoPayPalData,
            },
        };
    }
    return {
        error: error,
        viewData: viewData,
    };
}

exports.processForm = processForm;
