'use strict';

/**
 * Checkout.com Flow page bootstrap.
 *
 * Loaded only by templates/default/checkout/flow/flowPayment.isml, which is the
 * CKOFlow-Show page. It is the fallback for when Flow cannot be mounted inline
 * in the checkout place order step (see js/flow/flowInline.js). It reads the
 * configuration the page rendered and hands it to the shared Flow component.
 */
var flowComponent = require('./flow/flowComponent');

var CONFIG_SELECTOR = '#cko-flow-config';

var SELECTORS = {
    container: '#cko-flow-container',
    error: '#cko-flow-error',
};

var initialised = false;

/**
 * Read the bootstrap configuration rendered by the Flow page.
 * @returns {Object|null} The configuration, or null when the page is not a Flow page
 */
function readConfig() {
    var element = document.querySelector(CONFIG_SELECTOR);

    if (!element) {
        return null;
    }

    var data = element.dataset;

    return {
        componentsUrl: data.componentsUrl,
        publicKey: data.publicKey,
        environment: data.environment,
        locale: data.locale,
        appearance: data.appearance,
        paymentSession: data.paymentSession,
        orderNo: data.orderNo,
        completeUrl: data.completeUrl,
        failureUrl: data.failureUrl,
        csrfName: data.csrfName,
        csrfToken: data.csrfToken,
        genericError: data.genericError,
        loadError: data.loadError,
    };
}

/**
 * Read the configuration and mount the component.
 */
function init() {
    if (initialised) {
        return;
    }

    initialised = flowComponent.start(readConfig(), SELECTORS);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
