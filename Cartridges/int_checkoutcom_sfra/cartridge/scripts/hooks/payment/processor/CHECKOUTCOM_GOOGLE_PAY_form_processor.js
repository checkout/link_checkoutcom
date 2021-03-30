'use strict';

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req The request
 * @param {Object} paymentForm The payment form
 * @param {Object} viewFormData Object contains billing form data
 * @returns {Object} An object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    // var viewData = viewFormData;
    // var ckoGooglePayData = paymentForm.googlePayForm ? paymentForm.googlePayForm.ckoGooglePayData.htmlValue : null;
    // var error = true;

    var viewData = viewFormData;
    var error = true;
    var fieldErrors = {};

    if (paymentForm.paymentMethod.value) {
        error = false;
        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.htmlName,
        };

        var googlePayForm = paymentForm.googlePayForm;
        viewData.paymentInformation = {};

        // If this googlePay have a form
        if (googlePayForm) {
            Object.keys(googlePayForm).forEach(function(key) {
                var type = typeof googlePayForm[key];
                if (type === 'object' && googlePayForm[key] != null) {
                    viewData.paymentInformation[key] = {
                        value: googlePayForm[key].htmlValue,
                        htmlName: googlePayForm[key].htmlName,
                    };
                }
            });
        } else {
            viewData.paymentInformation.type = {
                value: paymentForm.paymentMethod.value,
                htmlName: paymentForm.paymentMethod.htmlName,
            };
        }

        // Validate form value
        if (viewData.paymentInformation) {
            Object.keys(viewData.paymentInformation).forEach(function(key) {
                var currentElement = viewData.paymentInformation[key];
                if (currentElement.value === '') {
                    error = true;
                    fieldErrors[currentElement.htmlName] = 'required';
                }
            });
        }
    }

    return {
        error: error,
        viewData: viewData,
        fieldErrors: fieldErrors,
    };
}

exports.processForm = processForm;
