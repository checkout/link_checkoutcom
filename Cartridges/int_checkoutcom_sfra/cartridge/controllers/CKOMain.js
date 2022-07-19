'use strict';

/* Server */
var server = require('server');

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var BasketMgr = require('dw/order/BasketMgr');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Locale = require('dw/util/Locale');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/* Checkout.com Event functions */
var eventsHelper = require('*/cartridge/scripts/helpers/eventsHelper');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var paymentHelper = require('*/cartridge/scripts/helpers/paymentHelper');

/** Apm Filter Configuration file **/
var ckoApmFilterConfig = require('*/cartridge/config/ckoApmFilterConfig');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Handles responses from the Checkout.com payment gateway.
 * @returns {string} The controller response
 */
server.get('HandleReturn', server.middleware.https, function(req, res, next) {
    // Prepare some variables
    var order;
    var placeOrderResult;
    var mode = ckoHelper.getValue(constants.CKO_MODE);
    var request = req;
    // Check if a session id is available
    var isQueryString = Object.prototype.hasOwnProperty.call(request, 'querystring');
    var isCkoSessionID = Object.prototype.hasOwnProperty.call(request.querystring, 'cko-session-id');
    if (isQueryString && isCkoSessionID) {
        // Perform the request to the payment gateway
        var gVerify = ckoHelper.gatewayClientRequest(
            'cko.verify.charges.' + mode + '.service',
            {
                paymentToken: request.querystring['cko-session-id'],
            }
        );

        // Load the order
        if (Object.prototype.hasOwnProperty.call(gVerify, 'reference') && gVerify.reference) {
            // Load the order
            order = OrderMgr.getOrder(gVerify.reference);

            // If there is a valid response
            var isValidResult = order && typeof (gVerify) === 'object'
            && Object.prototype.hasOwnProperty.call(gVerify, 'id')
            && ckoHelper.redirectPaymentSuccess(gVerify);
            if (isValidResult) {
                // Place the order
                placeOrderResult = COHelpers.placeOrder(order, { status: '' });
                if (placeOrderResult.error) {
                    Transaction.wrap(function() {
                        OrderMgr.failOrder(order, true);
                    });
                }

                // Show the order confirmation page
                paymentHelper.getConfirmationPageRedirect(res, order);
            } else {
                Transaction.wrap(function() {
                    OrderMgr.failOrder(order, true);
                });

                paymentHelper.getFailurePageRedirect(res);
            }
        }
    } else if (isQueryString && ckoHelper.paymentSuccess(request.querystring)) {
        // Place the order
        order = OrderMgr.getOrder(request.querystring.reference);
        placeOrderResult = COHelpers.placeOrder(order, { status: '' });
        if (placeOrderResult.error) {
            Transaction.wrap(function() {
                OrderMgr.failOrder(order, true);
            });

            paymentHelper.getFailurePageRedirect(res);
        }

        // Show the order confirmation page
        paymentHelper.getConfirmationPageRedirect(res, order);
    } else {
        paymentHelper.getFailurePageRedirect(res);
    }

    return next();
});

/**
 * Handles a failed payment from the Checkout.com payment gateway.
 * @returns {string} The controller response
 */
server.get('HandleFail', server.middleware.https, function(req, res, next) {
    // Prepare some variables
    var order;
    var mode = ckoHelper.getValue(constants.CKO_MODE);
    var request = req;

    // Check if a session id is available
    var isQueryString = Object.prototype.hasOwnProperty.call(request, 'querystring');
    var isCkoSessionID = Object.prototype.hasOwnProperty.call(request.querystring, 'cko-session-id');
    if (isQueryString && isCkoSessionID) {
        // Perform the request to the payment gateway
        var gVerify = ckoHelper.gatewayClientRequest(
            'cko.verify.charges.' + mode + '.service',
            {
                paymentToken: request.querystring['cko-session-id'],
            }
        );

        // Load the order
        if (Object.prototype.hasOwnProperty.call(gVerify, 'reference') && gVerify.reference) {
            // Load the order
            order = OrderMgr.getOrder(gVerify.reference);

            // If there is a valid response
            if (order) {
                // Restore the cart
                ckoHelper.checkAndRestoreBasket(order);

                // Fail the order
                Transaction.wrap(function() {
                    OrderMgr.failOrder(order, true);
                });

                // Send back to the error page
                paymentHelper.getFailurePageRedirect(res);
            }
        }
    }

    return next();
});

/**
 * Handles webhook responses from the Checkout.com payment gateway.
 * @returns {string} The controller response
 */
server.post('HandleWebhook', server.middleware.https, function(req, res, next) {
    var request = req;
    if (ckoHelper.isValidResponse(request)) {
        // Get the response as JSON object
        var hook = JSON.parse(request.body);

        // Check the webhook event
        if (hook !== null && Object.prototype.hasOwnProperty.call(hook, 'type')) {
            // Get a camel case function name from event type
            var func = '';
            var parts = hook.type.split('_');
            for (var i = 0; i < parts.length; i++) {
                func += (i === 0) ? parts[i] : parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
            }

            // Call the event
            eventsHelper[func](hook);
        }

        // Set a success response
        res.json({
            response: Resource.msg(
                'cko.webhook.success',
                'cko',
                null
            ),
        });
    } else {
        // Set a failure response
        res.json({
            response: Resource.msg(
                'cko.webhook.failure',
                'cko',
                null
            ),
        });
    }

    return next();
});

/**
 * Gets the APM filter data.
 * @returns {string} The controller response
 */
server.get('GetApmFilter', server.middleware.https, function(req, res, next) {
    // Prepare some variables
    var basket = BasketMgr.getCurrentBasket();
    if (basket) {
        var currencyCode = basket.getCurrencyCode();
        // eslint-disable-next-line no-undef
        var currentLocale = request.getLocale();
        var locale = Locale.getLocale(currentLocale);
        var countryCode = locale.getCountry();

        // Prepare the filter object
        var filterObject = {
            country: countryCode,
            currency: currencyCode,
        };

        // Prepare the response object
        var responseObject = {
            filterObject: filterObject,
            ckoApmFilterConfig: ckoApmFilterConfig,
        };

        // Write the response
        res.json(responseObject);
    }

    return next();
});

/*
 * Module exports
 */
module.exports = server.exports();
