'use strict';

/**
 * Checkout.com Flow component.
 *
 * Shared by the two places Flow is rendered: the standalone CKOFlow-Show page
 * (js/flow.js) and the inline mount in the checkout place order step
 * (js/flow/flowInline.js). It owns loading the Checkout Web Components bundle,
 * mounting the component, and settling the order through CKOFlow-Complete once
 * the gateway confirms the payment.
 *
 * The bundle is injected as a CLASSIC script rather than imported as an ES
 * module. The documented `import { loadCheckoutWebComponents } from ...` form
 * cannot be used here: module scripts are always fetched in CORS mode, and the
 * CDN serves index.js without an Access-Control-Allow-Origin header (an OPTIONS
 * preflight returns 403), so the import is blocked for every storefront origin.
 * A classic script tag is a no-CORS request, and the file is a UMD bundle, so it
 * assigns the loader to window.CheckoutWebComponents instead.
 *
 * Payment methods that take the shopper offsite (iDEAL, Klarna, Multibanco, ...)
 * never reach onPaymentCompleted. Flow redirects them to the success_url or
 * failure_url put on the payment session instead, which is handled server side
 * by CKOFlow-HandleReturn and CKOFlow-HandleFail.
 */

var SCRIPT_ID = 'cko-flow-components';

// The UMD global the bundle registers when loaded as a classic script. It is
// the loader function itself, equivalent to the loadCheckoutWebComponents
// named export of the module build.
var LOADER_GLOBAL = 'CheckoutWebComponents';

/**
 * Parse a JSON configuration value, tolerating an empty or malformed value.
 * @param {string} value The raw JSON string
 * @returns {Object|null} The parsed value, or null
 */
function parseJson(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
}

/**
 * Show an error above the payment form.
 * @param {Object} selectors The container and error element selectors
 * @param {string} message The message to show
 */
function showError(selectors, message) {
    var element = document.querySelector(selectors.error);

    if (!element) {
        return;
    }

    element.textContent = message;
    element.classList.remove('d-none');
}

/**
 * Hide any error currently shown above the payment form.
 * @param {Object} selectors The container and error element selectors
 */
function clearError(selectors) {
    var element = document.querySelector(selectors.error);

    if (element) {
        element.classList.add('d-none');
    }
}

/**
 * Mark the payment form as busy while the order is being settled.
 * @param {Object} selectors The container and error element selectors
 * @param {boolean} busy Whether the form is busy
 */
function setBusy(selectors, busy) {
    var container = document.querySelector(selectors.container);

    if (container) {
        container.classList.toggle('cko-flow-busy', busy);
    }
}

/**
 * Ask the storefront to settle the order for a completed Flow payment.
 * @param {Object} config The Flow configuration
 * @param {Object} selectors The container and error element selectors
 * @param {string} paymentId The payment id reported by the Flow component
 */
function completeOrder(config, selectors, paymentId) {
    var body = new window.URLSearchParams();

    body.append('paymentId', paymentId);
    body.append('orderNo', config.orderNo);

    if (config.csrfName && config.csrfToken) {
        body.append(config.csrfName, config.csrfToken);
    }

    setBusy(selectors, true);

    window.fetch(config.completeUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
    }).then(function(response) {
        return response.json();
    }).then(function(data) {
        if (data && data.redirectUrl) {
            window.location.href = data.redirectUrl;

            return;
        }

        setBusy(selectors, false);
        showError(selectors, (data && data.errorMessage) || config.genericError);
    }).catch(function() {
        // The payment went through, so the shopper is sent to the failure
        // route rather than being left on a dead page; the order is failed
        // and their basket restored there.
        window.location.href = config.failureUrl;
    });
}

/**
 * Inject the Checkout Web Components bundle as a classic script.
 * @param {Object} config The Flow configuration
 * @param {Object} selectors The container and error element selectors
 * @param {Function} onLoaded Called with the loader function once available
 */
function loadComponents(config, selectors, onLoaded) {
    var existing = document.getElementById(SCRIPT_ID);

    if (typeof window[LOADER_GLOBAL] === 'function') {
        onLoaded(window[LOADER_GLOBAL]);

        return;
    }

    if (existing) {
        existing.addEventListener('load', function() {
            onLoaded(window[LOADER_GLOBAL]);
        });

        return;
    }

    var script = document.createElement('script');

    script.id = SCRIPT_ID;
    script.src = config.componentsUrl;
    script.async = true;

    script.onload = function() {
        onLoaded(window[LOADER_GLOBAL]);
    };

    script.onerror = function() {
        showError(selectors, config.loadError);
    };

    document.head.appendChild(script);
}

/**
 * Mount the Flow component once the bundle has loaded.
 * @param {Function} loadCheckoutWebComponents The UMD loader function
 * @param {Object} config The Flow configuration
 * @param {Object} selectors The container and error element selectors
 * @param {Object} paymentSession The payment session created server side
 */
function mountFlow(loadCheckoutWebComponents, config, selectors, paymentSession) {
    if (typeof loadCheckoutWebComponents !== 'function') {
        showError(selectors, config.loadError);

        return;
    }

    var options = {
        publicKey: config.publicKey,
        environment: config.environment,
        locale: config.locale,
        paymentSession: paymentSession,

        onReady: function() {
            clearError(selectors);
            setBusy(selectors, false);
        },

        onPaymentCompleted: function(component, paymentResponse) {
            clearError(selectors);
            completeOrder(config, selectors, paymentResponse && paymentResponse.id);
        },

        onError: function(component, error) {
            setBusy(selectors, false);
            showError(selectors, (error && error.message) || config.genericError);
        },
    };

    var appearance = parseJson(config.appearance);

    if (appearance) {
        options.appearance = appearance;
    }

    loadCheckoutWebComponents(options).then(function(checkout) {
        var flowComponent = checkout.create('flow');

        // isAvailable() is optional on the bundle; when it is there it tells
        // us up front that no configured payment method can be rendered.
        if (typeof flowComponent.isAvailable !== 'function') {
            flowComponent.mount(selectors.container);

            return null;
        }

        return flowComponent.isAvailable().then(function(isAvailable) {
            if (!isAvailable) {
                showError(selectors, config.loadError);

                return;
            }

            flowComponent.mount(selectors.container);
        });
    }).catch(function() {
        showError(selectors, config.loadError);
    });
}

/**
 * Load the bundle and mount Flow into the given container.
 * @param {Object} config The Flow configuration: componentsUrl, publicKey,
 *     environment, locale, appearance, paymentSession (JSON string), orderNo,
 *     completeUrl, failureUrl, csrfName, csrfToken, genericError and loadError
 * @param {Object} selectors Selectors of the container to mount into and of the
 *     element errors are shown in
 * @returns {boolean} False when the configuration cannot be mounted
 */
function start(config, selectors) {
    if (!config || !config.componentsUrl || !document.querySelector(selectors.container)) {
        return false;
    }

    var paymentSession = parseJson(config.paymentSession);

    if (!paymentSession) {
        showError(selectors, config.loadError);

        return false;
    }

    loadComponents(config, selectors, function(loadCheckoutWebComponents) {
        mountFlow(loadCheckoutWebComponents, config, selectors, paymentSession);
    });

    return true;
}

module.exports = {
    start: start,
};
