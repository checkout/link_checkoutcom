'use strict';

/**
 * Default payment processor hook, invoked when no specific
 * Checkout.com processor matches the selected payment method.
 * Mirrors the SFRA base behaviour: the payment is rejected.
 * @returns {Object} The form validation result
 */
function Handle() {
    try {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoPayments').warn('app.payment.processor.default invoked — no payment processor matched');
    } catch (e) {
        // logging must never break the checkout flow
    }

    return {
        fieldErrors: {},
        serverErrors: [],
        error: true,
    };
}

/**
 * Default authorization hook: always fails, as there is no
 * processor able to authorize the payment.
 * @returns {Object} The payment authorization result
 */
function Authorize() {
    return {
        fieldErrors: {},
        serverErrors: [],
        error: true,
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;

// Alias export required by the Commerce Apps registry scan: the hook name's
// last segment (hooks.json) must exist as an export. SFCC resolves the hook
// functions above by name through HookMgr; this alias is not invoked.
module.exports['default'] = { Handle: Handle, Authorize: Authorize }; // eslint-disable-line dot-notation
