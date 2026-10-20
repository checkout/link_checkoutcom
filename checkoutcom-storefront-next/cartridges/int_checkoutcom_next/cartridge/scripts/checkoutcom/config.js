'use strict';

var Logger = require('dw/system/Logger');
var PaymentMgr = require('dw/order/PaymentMgr');
var Site = require('dw/system/Site');

/**
 * Site preferences of the "CKO Flow" group (impex/install/meta). One set of
 * keys per site: the mode picks the Checkout.com environment the keys belong to.
 * The ids of the keys, mode, debug flag and service endpoint are shared with
 * the bm_checkoutcom console.
 */
var PREFERENCES = {
    MODE: 'ckoMode',
    SECRET_KEY: 'ckoSecretKey',
    PUBLIC_KEY: 'ckoPublicKey',
    PRIVATE_SHARED_KEY: 'ckoPrivateSharedKey',
    PROCESSING_CHANNEL_ID: 'ckoProcessingChannelId',
    SERVICE_ENDPOINT: 'ckoServiceEndpoint',
    DEBUG: 'ckoDebugEnabled',
    ALLOWED_RETURN_ORIGINS: 'ckoFlowAllowedReturnOrigins',
    CAPTURE: 'ckoFlowCapture',
    THREE_DS: 'cko3ds',
    THREE_DS_CHALLENGE_INDICATOR: 'cko3dsChallengeIndicator',
    THREE_DS_ATTEMPT_N3D: 'cko3dsAttemptN3d',
    RISK: 'ckoEnableRiskFlag',
    PAYMENT_METHODS: 'ckoFlowPaymentMethods',
    SAVE_PAYMENT_DETAILS: 'ckoFlowSavePaymentDetails',
    APPEARANCE: 'ckoFlowAppearance',
    COMPONENT_OPTIONS: 'ckoFlowComponentOptions',
    TRANSLATIONS: 'ckoFlowTranslations',
};

/** Payment method and processor id of every order paid with Flow. */
var PAYMENT_METHOD_ID = 'CHECKOUTCOM_FLOW';

/** Logger category for everything this cartridge writes. */
var LOG_CATEGORY = 'checkoutcom';

/** Integration version, sent to Checkout.com; keep in step with package.json. */
var VERSION = '26.5.0';

/** User-Agent of the requests to Checkout.com, in the SFRA cartridge's format. */
var PLATFORM_DATA = 'Checkout.com Storefront Next Cartridge - Version: ' + VERSION;

/**
 * Read a preference value, unwrapping enum preferences: SFCC returns those as
 * dw.value.EnumValue rather than as a string.
 * @param {string} id The preference id
 * @returns {*} The preference value
 */
function getValue(id) {
    var value = Site.getCurrent().getCustomPreferenceValue(id);

    if (value && typeof value === 'object' && value.value !== undefined) {
        return value.value;
    }

    return value;
}

/**
 * Read a key preference without the whitespace a copy and paste often adds;
 * Checkout.com rejects a padded key with an empty 401.
 * @param {string} id The preference id
 * @returns {string|null} The key, or null when unset
 */
function getKey(id) {
    var value = getValue(id);

    return value ? String(value).trim() : null;
}

/**
 * Split a comma separated preference into a trimmed, non empty list.
 * @param {string} id The preference id
 * @returns {Array<string>} The values
 */
function getList(id) {
    var value = getValue(id);

    if (!value) {
        return [];
    }

    return String(value).split(',').map(function(item) {
        return item.trim();
    }).filter(function(item) {
        return item.length > 0;
    });
}

/**
 * Read a JSON object preference. Invalid JSON (or JSON that is not an object)
 * is logged and ignored so a bad value never breaks checkout.
 * @param {string} id The preference id
 * @param {string} label The preference name, for the log
 * @returns {Object|null} The object, or null
 */
function getJson(id, label) {
    var value = getValue(id);

    if (!value) {
        return null;
    }

    try {
        var parsed = JSON.parse(value);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch (e) {
        // logged below
    }

    Logger.getLogger(LOG_CATEGORY).warn('Invalid {0} JSON ignored; the Flow defaults are used.', label);

    return null;
}

module.exports = {
    PREFERENCES: PREFERENCES,
    PAYMENT_METHOD_ID: PAYMENT_METHOD_ID,
    LOG_CATEGORY: LOG_CATEGORY,
    PLATFORM_DATA: PLATFORM_DATA,
    getValue: getValue,
    getList: getList,

    /**
     * Flow is switched on and off with the CHECKOUTCOM_FLOW payment method
     * (Merchant Tools > Ordering > Payment Methods).
     * @returns {boolean} True when the payment method is enabled
     */
    isEnabled: function() {
        var method = PaymentMgr.getPaymentMethod(PAYMENT_METHOD_ID);

        return !!method && method.isActive();
    },

    /** @returns {boolean} True for the production environment */
    isProduction: function() {
        return getValue(PREFERENCES.MODE) === 'production';
    },

    /** @returns {string} 'sandbox' or 'production': the mode segment of the service ids and the Flow environment */
    getMode: function() {
        return this.isProduction() ? 'production' : 'sandbox';
    },

    /** @returns {string} The environment option of Checkout Web Components */
    getEnvironment: function() {
        return this.getMode();
    },

    /** @returns {string|null} The secret key */
    getSecretKey: function() {
        return getKey(PREFERENCES.SECRET_KEY);
    },

    /** @returns {string|null} The public key */
    getPublicKey: function() {
        return getKey(PREFERENCES.PUBLIC_KEY);
    },

    /** @returns {string|null} The key that authenticates incoming webhooks */
    getPrivateSharedKey: function() {
        return getKey(PREFERENCES.PRIVATE_SHARED_KEY);
    },

    /** @returns {boolean} True when payments are captured automatically (on unless switched off) */
    isCaptureEnabled: function() {
        return getValue(PREFERENCES.CAPTURE) !== false;
    },

    /**
     * The 3ds request block: enabled, challenge_indicator (one of the
     * Checkout.com values, no_preference by default) and attempt_n3d (a
     * true/false drop-down, false by default).
     * @returns {Object} The 3ds request block
     */
    getThreeDS: function() {
        return {
            enabled: getValue(PREFERENCES.THREE_DS) === true,
            challenge_indicator: getValue(PREFERENCES.THREE_DS_CHALLENGE_INDICATOR) || 'no_preference',
            attempt_n3d: String(getValue(PREFERENCES.THREE_DS_ATTEMPT_N3D)) === 'true',
        };
    },

    /** @returns {boolean} True when the Checkout.com risk assessment runs */
    isRiskEnabled: function() {
        return getValue(PREFERENCES.RISK) === true;
    },

    /** @returns {boolean} True when debug logging is on */
    isDebugEnabled: function() {
        return getValue(PREFERENCES.DEBUG) === true;
    },

    /**
     * The Service Endpoint override: an https base URL that replaces the
     * Checkout.com host of every API call (for example a regional endpoint).
     * Invalid values are logged and ignored.
     * @returns {string|null} The base URL without trailing slash, or null
     */
    getServiceEndpoint: function() {
        var endpoint = getKey(PREFERENCES.SERVICE_ENDPOINT);

        if (!endpoint) {
            return null;
        }

        if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(endpoint)) {
            Logger.getLogger(LOG_CATEGORY).warn('Invalid Service Endpoint "{0}" ignored.', endpoint);

            return null;
        }

        return endpoint.replace(/\/$/, '');
    },

    /**
     * The Flow `appearance` overrides (colours, fonts, borders). They apply on
     * top of the storefront theme the extension maps by default.
     * @returns {Object|null} The appearance object, or null
     */
    getAppearance: function() {
        return getJson(PREFERENCES.APPEARANCE, 'Flow Appearance');
    },

    /**
     * The Flow `componentOptions` (per payment method: card fields, wallets
     * button style, accepted schemes...). The storefront drops the keys that
     * would override the order (amount, currency, items) or the pay button.
     * @returns {Object|null} The component options, or null
     */
    getComponentOptions: function() {
        return getJson(PREFERENCES.COMPONENT_OPTIONS, 'Flow Component Options');
    },

    /**
     * The Flow `translations`: custom text per locale, e.g. {"en-US":{"pay_button.pay":"Pay now"}}.
     * @returns {Object|null} The translations, or null
     */
    getTranslations: function() {
        return getJson(PREFERENCES.TRANSLATIONS, 'Flow Translations');
    },
};
