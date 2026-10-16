'use strict';

/**
 * Checkout.com Flow component bootstrap.
 *
 * Loaded only by templates/default/checkout/flow/flowPayment.isml. This script
 * owns the whole client side of Flow: loading the Checkout Web Components bundle,
 * reading the bootstrap configuration, mounting the component, and settling the
 * order through CKOFlow-Complete once the gateway confirms the payment.
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
 * failure_url that CKOFlow-Show put on the payment session instead, which is
 * handled server side by CKOFlow-HandleReturn and CKOFlow-HandleFail.
 */
(function() {
    var CONFIG_SELECTOR = '#cko-flow-config';
    var CONTAINER_SELECTOR = '#cko-flow-container';
    var ERROR_SELECTOR = '#cko-flow-error';
    var SCRIPT_ID = 'cko-flow-components';

    // The UMD global the bundle registers when loaded as a classic script. It is
    // the loader function itself, equivalent to the loadCheckoutWebComponents
    // named export of the module build.
    var LOADER_GLOBAL = 'CheckoutWebComponents';

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
     * @param {string} message The message to show
     */
    function showError(message) {
        var element = document.querySelector(ERROR_SELECTOR);

        if (!element) {
            return;
        }

        element.textContent = message;
        element.classList.remove('d-none');
    }

    /**
     * Hide any error currently shown above the payment form.
     */
    function clearError() {
        var element = document.querySelector(ERROR_SELECTOR);

        if (element) {
            element.classList.add('d-none');
        }
    }

    /**
     * Mark the page as busy while the order is being settled.
     * @param {boolean} busy Whether the page is busy
     */
    function setBusy(busy) {
        var container = document.querySelector(CONTAINER_SELECTOR);

        if (container) {
            container.classList.toggle('cko-flow-busy', busy);
        }
    }

    /**
     * Ask the storefront to settle the order for a completed Flow payment.
     * @param {Object} config The Flow configuration
     * @param {string} paymentId The payment id reported by the Flow component
     */
    function completeOrder(config, paymentId) {
        var body = new window.URLSearchParams();

        body.append('paymentId', paymentId);
        body.append('orderNo', config.orderNo);

        if (config.csrfName && config.csrfToken) {
            body.append(config.csrfName, config.csrfToken);
        }

        setBusy(true);

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

            setBusy(false);
            showError((data && data.errorMessage) || config.genericError);
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
     * @param {Function} onLoaded Called with the loader function once available
     */
    function loadComponents(config, onLoaded) {
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
            showError(config.loadError);
        };

        document.head.appendChild(script);
    }

    /**
     * Mount the Flow component once the bundle has loaded.
     * @param {Function} loadCheckoutWebComponents The UMD loader function
     * @param {Object} config The Flow configuration
     * @param {Object} paymentSession The payment session created server side
     */
    function mountFlow(loadCheckoutWebComponents, config, paymentSession) {
        if (typeof loadCheckoutWebComponents !== 'function') {
            showError(config.loadError);

            return;
        }

        var options = {
            publicKey: config.publicKey,
            environment: config.environment,
            locale: config.locale,
            paymentSession: paymentSession,

            onReady: function() {
                clearError();
                setBusy(false);
            },

            onPaymentCompleted: function(component, paymentResponse) {
                clearError();
                completeOrder(config, paymentResponse && paymentResponse.id);
            },

            onError: function(component, error) {
                setBusy(false);
                showError((error && error.message) || config.genericError);
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
                flowComponent.mount(CONTAINER_SELECTOR);

                return null;
            }

            return flowComponent.isAvailable().then(function(isAvailable) {
                if (!isAvailable) {
                    showError(config.loadError);

                    return;
                }

                flowComponent.mount(CONTAINER_SELECTOR);
            });
        }).catch(function() {
            initialised = false;
            showError(config.loadError);
        });
    }

    /**
     * Read the configuration, load the bundle and mount the component.
     */
    function init() {
        if (initialised) {
            return;
        }

        var config = readConfig();

        if (!config || !config.componentsUrl || !document.querySelector(CONTAINER_SELECTOR)) {
            return;
        }

        var paymentSession = parseJson(config.paymentSession);

        if (!paymentSession) {
            showError(config.loadError);

            return;
        }

        initialised = true;

        loadComponents(config, function(loadCheckoutWebComponents) {
            mountFlow(loadCheckoutWebComponents, config, paymentSession);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
