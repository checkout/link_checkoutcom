'use strict';

/**
 * Masking of gateway payloads before they are written to a log (the ckodebug
 * custom log and the service communication logs).
 *
 * The payloads differ per payment method and change over time (Flow sessions,
 * wallet tokens, APM sources carrying national ids, Plaid credentials), so the
 * masking is not a list of fields to hide. It walks the whole structure, nested
 * objects and arrays included, and keeps in clear only the values of the keys
 * listed below, which describe the payment and never the shopper, the card or a
 * credential. Every other value is masked, whatever its key and wherever it is.
 */

/**
 * Keys whose values are kept in clear: amounts, statuses, codes, dates and
 * flags. Keys are compared in lower case.
 */
var CLEAR_KEYS = [
    // The payment and its outcome
    'amount', 'currency', 'status', 'approved', 'reference', 'type', 'payment_type',
    'capture', 'capture_on', 'response_code', 'response_summary', 'processing_channel_id',
    'created_on', 'processed_on', 'requested_on', 'expires_on', 'expiration',
    'payment_processor', 'description', 'locale', 'country', 'enabled_payment_methods',
    'disabled_payment_methods', 'payment_method', 'payment_method_category',
    // Balances
    'total_authorized', 'total_voided', 'available_to_void', 'total_captured',
    'available_to_capture', 'total_refunded', 'available_to_refund',
    // Order lines (amounts and quantities, never names or references of people)
    'quantity', 'unit_price', 'total_amount', 'tax_amount', 'tax_rate', 'discount_amount',
    'shipping_amount', 'commodity_code', 'unit_of_measure',
    // Card attributes that identify no card
    'scheme', 'local_schemes', 'card_type', 'card_category', 'card_wallet_type',
    'issuer_country', 'product_type', 'product_id',
    // 3-D Secure flags
    'enabled', 'attempt_n3d', 'challenge_indicator', 'exemption', 'version',
    'eci', 'authentication_response', 'challenged', 'downgraded', 'enrolled',
    // Errors
    'error_type', 'error_codes', 'request_id', 'code', 'error_code', 'error_message',
    // Redirect targets of the storefront
    'success_url', 'failure_url',
];

var MAX_DEPTH = 20;

/**
 * Mask a value, keeping its length and separators so a log reader can still see
 * that a value was present.
 * @param {*} value A primitive value
 * @returns {*} The masked value; booleans and null are kept
 */
function maskValue(value) {
    if (value === null || value === undefined || typeof value === 'boolean') {
        return value;
    }

    return String(value).replace(/[A-Za-z0-9]/g, '*');
}

/**
 * @param {string} key An object key
 * @returns {boolean} True when the key's value may be logged in clear
 */
function isClearKey(key) {
    return CLEAR_KEYS.indexOf(String(key).toLowerCase()) !== -1;
}

/**
 * Mask a structure in place, recursively.
 * @param {*} value The value
 * @param {boolean} clear True when the value sits under a clear key
 * @param {number} depth The nesting depth
 * @returns {*} The masked value
 */
function walk(value, clear, depth) {
    if (value === null || value === undefined) {
        return value;
    }

    if (depth > MAX_DEPTH) {
        return '[redacted]';
    }

    if (Array.isArray(value)) {
        return value.map(function(item) {
            return walk(item, clear, depth + 1);
        });
    }

    if (typeof value === 'object') {
        var result = {};

        Object.keys(value).forEach(function(key) {
            result[key] = walk(value[key], isClearKey(key), depth + 1);
        });

        return result;
    }

    return clear ? value : maskValue(value);
}

var sensitiveDataHelper = {
    /**
     * Mask everything in a payload but the values of the clear keys.
     * @param {*} data A payload (object, array or primitive)
     * @returns {*} A masked copy; the input is not changed
     */
    redact: function(data) {
        return walk(data, false, 0);
    },

    /**
     * Mask a payload for a log line.
     * @param {Object|string} data A payload, or its JSON text
     * @returns {string} The masked JSON text; a payload that is not JSON is never logged
     */
    redactToString: function(data) {
        var parsed = data;

        if (data === null || data === undefined || data === '') {
            return '';
        }

        if (typeof data === 'string') {
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                return '[unparsed payload of ' + data.length + ' characters, not logged]';
            }
        }

        try {
            return JSON.stringify(this.redact(parsed));
        } catch (e) {
            return '[payload not logged: ' + e.message + ']';
        }
    },

    /**
     * @param {string} key An object key
     * @returns {boolean} True when the key's value is logged in clear
     */
    isClearKey: isClearKey,
};

/**
 * Module exports
 */
module.exports = sensitiveDataHelper;
