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
    try {
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
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').error('CHECKOUTCOM_SEQURA processForm failed: {0}', e.message);
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
exports.checkoutcom_sequra = { processForm: processForm };
