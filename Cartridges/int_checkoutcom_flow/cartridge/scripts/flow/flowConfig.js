'use strict';

var Site = require('dw/system/Site');

/**
 * Site preference ids. Account-level preferences (mode, keys, channel) share
 * their ids with the classic LINK cartridge so a merchant running both only
 * configures credentials once; Flow-specific preferences use the ckoFlow prefix.
 */
var PREFERENCES = {
    MODE: 'ckoMode',
    SANDBOX_SECRET_KEY: 'ckoSandboxNASSecretKey',
    SANDBOX_PUBLIC_KEY: 'ckoSandboxNASPublicKey',
    SANDBOX_PRIVATE_SHARED_KEY: 'ckoSandboxNASPrivateSharedKey',
    LIVE_SECRET_KEY: 'ckoLiveNASSecretKey',
    LIVE_PUBLIC_KEY: 'ckoLiveNASPublicKey',
    LIVE_PRIVATE_SHARED_KEY: 'ckoLiveNASPrivateSharedKey',
    PROCESSING_CHANNEL_ID: 'ckoProcessingChannelId',
    SUCCESS_URL: 'ckoFlowSuccessUrl',
    FAILURE_URL: 'ckoFlowFailureUrl',
    DEBUG_ENABLED: 'ckoDebugEnabled',
};

/**
 * Payment method / processor id used for Flow payments.
 */
var PAYMENT_METHOD_ID = 'CHECKOUTCOM_FLOW';

/**
 * Centralized configuration access for the Flow cartridge.
 */
var flowConfig = {
    PREFERENCES: PREFERENCES,
    PAYMENT_METHOD_ID: PAYMENT_METHOD_ID,

    /**
     * Get a site preference value.
     * @param {string} id The preference id
     * @returns {*} The preference value
     */
    getValue: function(id) {
        return Site.getCurrent().getCustomPreferenceValue(id);
    },

    /**
     * Whether the site runs against the live environment.
     * @returns {boolean} True for live mode
     */
    isLive: function() {
        var mode = this.getValue(PREFERENCES.MODE);
        return (mode && mode.value ? mode.value : String(mode)) === 'live';
    },

    /**
     * The mode segment used in service ids ('sandbox'|'live').
     * @returns {string} The mode
     */
    getMode: function() {
        return this.isLive() ? 'live' : 'sandbox';
    },

    /**
     * The secret key for the configured mode.
     * @returns {string} The secret key
     */
    getSecretKey: function() {
        return this.getValue(this.isLive() ? PREFERENCES.LIVE_SECRET_KEY : PREFERENCES.SANDBOX_SECRET_KEY);
    },

    /**
     * The public key for the configured mode.
     * @returns {string} The public key
     */
    getPublicKey: function() {
        return this.getValue(this.isLive() ? PREFERENCES.LIVE_PUBLIC_KEY : PREFERENCES.SANDBOX_PUBLIC_KEY);
    },

    /**
     * The private shared key used to authenticate incoming webhooks.
     * @returns {string} The private shared key
     */
    getPrivateSharedKey: function() {
        return this.getValue(this.isLive() ? PREFERENCES.LIVE_PRIVATE_SHARED_KEY : PREFERENCES.SANDBOX_PRIVATE_SHARED_KEY);
    },
};

module.exports = flowConfig;
