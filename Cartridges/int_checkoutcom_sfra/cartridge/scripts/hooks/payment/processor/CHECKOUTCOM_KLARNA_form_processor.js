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
    var ckoKlarnaData = paymentForm.klarnaForm ? paymentForm.klarnaForm.ckoKlarnaData.htmlValue : null;


    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.htmlValue,
        htmlName: paymentForm.paymentMethod.htmlValue,
    };

    viewData.paymentInformation = {
        ckoKlarnaData: {
            value: ckoKlarnaData,
            htmlName: ckoKlarnaData,
        },
    };

    return {
        error: false,
        viewData: viewData,
    };
}

exports.processForm = processForm;
