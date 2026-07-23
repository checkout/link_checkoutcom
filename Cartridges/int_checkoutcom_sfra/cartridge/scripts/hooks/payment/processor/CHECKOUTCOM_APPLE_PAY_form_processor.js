'use strict';

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(paymentForm, viewFormData) {
    try {
        var viewData = viewFormData;
        var ckoApplePayData = paymentForm.ckoApplePayData ? paymentForm.applePayForm.ckoApplePayData.htmlValue : null;
        var error = true;

        if (ckoApplePayData) {
            viewData.paymentMethod = {
                value: paymentForm.paymentMethod.htmlValue,
                htmlName: paymentForm.paymentMethod.htmlValue,
            };

            viewData.paymentInformation = {
                ckoApplePayData: {
                    value: ckoApplePayData.htmlValue,
                    htmlName: ckoApplePayData.htmlName,
                },
            };
        }

        return {
            error: error,
            viewData: viewData,
        };
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').error('CHECKOUTCOM_APPLE_PAY processForm failed: {0}', e.message);
        return {
            error: true,
            viewData: viewFormData,
        };
    }
}

exports.processForm = processForm;
