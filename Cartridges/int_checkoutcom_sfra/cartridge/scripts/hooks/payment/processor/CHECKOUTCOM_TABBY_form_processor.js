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

        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.htmlValue,
            htmlName: paymentForm.paymentMethod.htmlValue,
        };

        viewData.paymentInformation = {};

        return {
            error: false,
            viewData: viewData,
        };
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').error('CHECKOUTCOM_TABBY processForm failed: {0}', e.message);
        return {
            error: true,
            viewData: viewFormData,
        };
    }
}

exports.processForm = processForm;

// Alias export required by the Commerce Apps registry scan: the hook name's
// last segment (hooks.json) must exist as an export. SFCC resolves the hook
// functions above by name through HookMgr; this alias is not invoked.
exports.checkoutcom_tabby = { processForm: processForm };
