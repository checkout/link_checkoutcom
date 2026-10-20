'use strict';

/**
 * Checkout.com Flow configuration.
 *
 * Every Flow specific preference id and static value lives here so the Flow
 * component stays self contained: it never mutates config/constants.js, which is
 * shared with the card, APM, Apple Pay, Google Pay and SiteGenesis integrations.
 */
var ckoFlowConfig = {
    /* Payment method and processor registered by this component */
    PAYMENT_METHOD_ID: 'CHECKOUTCOM_FLOW',
    PAYMENT_PROCESSOR_ID: 'CHECKOUTCOM_FLOW',

    /* Site preference ids */
    CKO_FLOW_ENABLED: 'ckoFlowEnabled',
    CKO_FLOW_CAPTURE: 'ckoFlowCapture',
    CKO_FLOW_APPEARANCE: 'ckoFlowAppearance',
    CKO_FLOW_PAYMENT_METHODS: 'ckoFlowPaymentMethods',
    CKO_FLOW_SAVE_PAYMENT_DETAILS: 'ckoFlowSavePaymentDetails',
    CKO_FLOW_DISPLAY_MODE: 'ckoFlowDisplayMode',

    /* Values of the ckoFlowDisplayMode preference */
    DISPLAY_MODE_INLINE: 'inline',
    DISPLAY_MODE_PAGE: 'page',

    /* Checkout Web Components (Flow) ES module bundle */
    COMPONENTS_URL: 'https://checkout-web-components.checkout.com/index.js',

    /* Values accepted by the environment option of loadCheckoutWebComponents() */
    ENVIRONMENT_SANDBOX: 'sandbox',
    ENVIRONMENT_PRODUCTION: 'production',

    /* Prefix of the LocalServiceRegistry ids used to create payment sessions */
    SESSION_SERVICE_PREFIX: 'cko.flow.sessions.',

    /* Service id used to read a payment back from the gateway (GET /payments/{id}) */
    VERIFY_SERVICE_PREFIX: 'cko.verify.charges.',

    /* Service id used to release funds when the order cannot be completed */
    VOID_SERVICE_PREFIX: 'cko.transaction.void.',

    /*
     * Payment statuses returned by GET /payments/{id} that mean the shopper has
     * paid (or committed to pay) and the order may be placed.
     */
    APPROVED_STATUSES: ['Authorized', 'Captured', 'Card Verified', 'Paid'],

    /*
     * Statuses that are not final yet. Delayed notification methods such as
     * Multibanco or Fawry land here: the order is placed as NOT PAID and the
     * existing Checkout.com webhook handlers settle it later.
     */
    PENDING_STATUSES: ['Pending'],

    /* Gateway response codes that represent an approved authorization */
    APPROVED_RESPONSE_CODES: ['10000', '10100', '10200'],
};

/*
 * Module exports
 */
module.exports = ckoFlowConfig;
