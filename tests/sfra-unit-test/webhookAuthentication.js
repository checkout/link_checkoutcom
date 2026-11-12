'use strict';

/**
 * Webhook authentication (ckoHelper.isValidResponse), as set in the Webhook
 * Authentication preference: the Authorization header key, the cko-signature
 * HMAC of the body, or both.
 */

var assert = require('chai').assert;
var crypto = require('crypto');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../Cartridges/int_checkoutcom_sfra/cartridge';
var constants = require(CARTRIDGE + '/config/constants');

var HEADER_KEY = 'header_key_test';
var SIGNATURE_KEY = 'signature_key_test';
var BODY = '{"id":"evt_1","type":"payment_captured","data":{"id":"pay_1","reference":"00001"}}';

/**
 * @param {string} body The body
 * @param {string} key The signature key
 * @returns {string} The cko-signature of the body
 */
function sign(body, key) {
    return crypto.createHmac('sha256', key).update(body).digest('hex');
}

/**
 * Load ckoHelper with the given site preferences.
 * @param {Object} preferences Preference values by id
 * @returns {Object} The helper
 */
function loadHelper(preferences) {
    var values = Object.assign({
        ckoMode: 'sandbox',
        ckoSandboxNASEnabled: 'NAS',
        ckoSandboxNASPrivateSharedKey: HEADER_KEY,
        ckoSandboxWebhookSignatureKey: SIGNATURE_KEY,
    }, preferences || {});

    function Mac() {}
    Mac.HMAC_SHA_256 = 'HmacSHA256';
    Mac.prototype.digest = function(input, key) { return crypto.createHmac('sha256', key).update(input).digest(); };

    return proxyquire(CARTRIDGE + '/scripts/helpers/ckoHelper', {
        'dw/system/Transaction': {},
        'dw/order/OrderMgr': {},
        'dw/order/BasketMgr': {},
        'dw/system/Logger': { getLogger: function() { return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} }; } },
        'dw/object/SystemObjectMgr': {},
        'dw/web/Resource': { msg: function(key) { return key; } },
        'dw/system/Site': { getCurrent: function() { return { getCustomPreferenceValue: function(id) { return values[id] === undefined ? null : values[id]; } }; } },
        'dw/util/Locale': {},
        'dw/crypto/Mac': Mac,
        'dw/crypto/Encoding': { toHex: function(bytes) { return bytes.toString('hex'); } },
        '*/cartridge/config/ckoCurrencyConfig': {},
        '*/cartridge/config/ckoMadaConfig': {},
        '*/cartridge/config/constants': constants,
        '*/cartridge/scripts/cart/cartHelpers': {},
        '*/cartridge/scripts/helpers/sensitiveDataHelper.js': {},
        '*/cartridge/scripts/services/ckoPayments': {},
    });
}

/**
 * @param {Object} headers The request headers
 * @param {string} [body] The raw body
 * @returns {Object} A webhook request
 */
function webhook(headers, body) {
    return { httpHeaders: headers, body: body === undefined ? BODY : body };
}

describe('Webhook authentication: Authorization header (the default)', function() {
    var helper = loadHelper();

    it('accepts the header key', function() {
        assert.isTrue(helper.isValidResponse(webhook({ authorization: HEADER_KEY })));
    });

    it('refuses a wrong or missing header', function() {
        assert.isFalse(helper.isValidResponse(webhook({ authorization: 'guess' })));
        assert.isFalse(helper.isValidResponse(webhook({})));
    });

    it('refuses everything when no header key is configured, even a request without the header', function() {
        assert.isFalse(loadHelper({ ckoSandboxNASPrivateSharedKey: null }).isValidResponse(webhook({})));
    });
});

describe('Webhook authentication: signature', function() {
    var helper = loadHelper({ ckoWebhookAuthentication: { value: 'signature' } });

    it('accepts a body signed with the signature key', function() {
        assert.isTrue(helper.isValidResponse(webhook({ 'cko-signature': sign(BODY, SIGNATURE_KEY) })));
    });

    it('refuses a forged body, even with the header key', function() {
        var forged = BODY.replace('pay_1', 'pay_2');

        assert.isFalse(helper.isValidResponse(webhook({ authorization: HEADER_KEY, 'cko-signature': sign(BODY, SIGNATURE_KEY) }, forged)));
        assert.isFalse(helper.isValidResponse(webhook({ authorization: HEADER_KEY }, forged)));
    });

    it('refuses a body signed with another key', function() {
        assert.isFalse(helper.isValidResponse(webhook({ 'cko-signature': sign(BODY, 'other') })));
    });

    it('accepts any of several comma-separated keys while rotating', function() {
        var rotating = loadHelper({ ckoWebhookAuthentication: 'signature', ckoSandboxWebhookSignatureKey: 'old_key, ' + SIGNATURE_KEY });

        assert.isTrue(rotating.isValidResponse(webhook({ 'cko-signature': sign(BODY, SIGNATURE_KEY) })));
        assert.isTrue(rotating.isValidResponse(webhook({ 'cko-signature': sign(BODY, 'old_key') })));
    });

    it('refuses everything when no signature key is configured', function() {
        var unset = loadHelper({ ckoWebhookAuthentication: 'signature', ckoSandboxWebhookSignatureKey: null });

        assert.isFalse(unset.isValidResponse(webhook({ 'cko-signature': sign(BODY, SIGNATURE_KEY) })));
    });
});

describe('Webhook authentication: header and signature', function() {
    var helper = loadHelper({ ckoWebhookAuthentication: 'both' });

    it('needs both checks to pass', function() {
        var signature = sign(BODY, SIGNATURE_KEY);

        assert.isTrue(helper.isValidResponse(webhook({ authorization: HEADER_KEY, 'cko-signature': signature })));
        assert.isFalse(helper.isValidResponse(webhook({ 'cko-signature': signature })));
        assert.isFalse(helper.isValidResponse(webhook({ authorization: HEADER_KEY })));
    });
});
