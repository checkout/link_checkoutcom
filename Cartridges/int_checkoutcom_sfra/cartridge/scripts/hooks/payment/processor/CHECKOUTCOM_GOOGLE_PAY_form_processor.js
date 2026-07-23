'use strict';

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - the request
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    try {
        var viewData = viewFormData;
        var ckoGooglePayData = paymentForm.googlePayForm ? paymentForm.googlePayForm.ckoGooglePayData.htmlValue : null;
        var error = true;

        if (ckoGooglePayData) {
            error = false;
            viewData.paymentMethod = {
                value: paymentForm.paymentMethod.htmlValue,
                htmlName: paymentForm.paymentMethod.htmlValue,
            };

            viewData.paymentInformation = {
                ckoGooglePayData: {
                    value: ckoGooglePayData,
                    htmlName: ckoGooglePayData,
                },
            };
        }
        return {
            error: error,
            viewData: viewData,
        };
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').error('CHECKOUTCOM_GOOGLE_PAY processForm failed: {0}', e.message);
        return {
            error: true,
            viewData: viewFormData,
        };
    }
}

exports.processForm = processForm;
