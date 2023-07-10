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

// Card Mada Bins
var ckoMadaConfig = require('*/cartridge/config/ckoMadaConfig');

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

server.post('GetShippingMethods', server.middleware.https, function(req, res, next) {
    var shippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');
    var CartModel = require('*/cartridge/models/cart');
    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var ShippingMgr = require('dw/order/ShippingMgr');

    var shipMethods = [];
    var shipCosts = {};
    var salesTax = {};
    var discounts = {};

    var currentBasket = BasketMgr.getCurrentBasket();

    var productDiscountTotal = 0;
    var productLineItems = currentBasket.getProductLineItems();
    for (var index = 0; index < productLineItems.length; index++) {
        var productLineItem = productLineItems[index];
        var priceAdjustments = productLineItem.getPriceAdjustments();
        for (var i = 0; i < priceAdjustments.length; i++) {
            var priceAdjustment = priceAdjustments[i];
            // eslint-disable-next-line operator-assignment
            productDiscountTotal = productDiscountTotal + priceAdjustment.priceValue;
        }
    }

    var shipment = currentBasket.defaultShipment;

    var defaultSelectedShippingMethod = ShippingMgr.getDefaultShippingMethod();
    var defaultSelectedShippingMethodId = defaultSelectedShippingMethod.ID;

    var address = req.form.address;

    if (address) {
        address = JSON.parse(req.form.address);
    }

    if (address) {
        var shipAddress = {
            firstName: address.firstName,
            lastName: address.lastName,
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            stateCode: address.stateCode,
            postalCode: address.postalCode,
            countryCode: address.countryCode,
            phone: address.phone,
        };

        Transaction.wrap(function() {
            var shippingAddress = shipment.shippingAddress;

            if (!shippingAddress) {
                shippingAddress = shipment.createShippingAddress();
            }

            Object.keys(shipAddress).forEach(function(key) {
                var value = shipAddress[key];
                if (value) {
                    shippingAddress[key] = value;
                } else {
                    shippingAddress[key] = null;
                }
            });
        });
    }

    if (currentBasket.shipments && currentBasket.shipments[0]) {
        var applicableShippingMethods = shippingHelper.getApplicableShippingMethods(currentBasket.shipments[0], null, currentBasket);
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (var key in applicableShippingMethods) {
            var applicableShippingMethod = applicableShippingMethods[key];
            if (applicableShippingMethod.ID) {
                // eslint-disable-next-line no-loop-func
                Transaction.wrap(function() {
                    shippingHelper.selectShippingMethod(shipment, applicableShippingMethod.ID);
                    basketCalculationHelpers.calculateTotals(currentBasket);
                    var basket = BasketMgr.getCurrentBasket();
                    var ship = {
                        id: applicableShippingMethod.ID,
                        label: applicableShippingMethod.displayName,
                        description: applicableShippingMethod.description,
                    };
                    shipMethods.push(ship);
                    shipCosts[applicableShippingMethod.ID] = basket.shippingTotalPrice.value.toString();
                    salesTax[applicableShippingMethod.ID] = basket.totalTax.value.toString();

                    var cartModel = new CartModel(currentBasket);
                    var totalDiscount = cartModel.totals.shippingLevelDiscountTotal.value + cartModel.totals.orderLevelDiscountTotal.value;
                    discounts[applicableShippingMethod.ID] = totalDiscount.toString();
                });
            }
        }
    }

    res.json({
        shipMethods: shipMethods,
        shipCosts: shipCosts,
        salesTax: salesTax,
        discounts: discounts,
        productDiscountTotal: productDiscountTotal,
        defaultShippingMethod: defaultSelectedShippingMethodId,
    });

    return next();
});

server.get('MadaBin', function(req, res, next) {
    try {
        // eslint-disable-next-line no-undef
        var binType = req.querystring.type;
        var madaBins = {};

        // eslint-disable-next-line no-undef
        var currentLocale = request.getLocale();
        var locale = Locale.getLocale(currentLocale);
        var countryCode = locale.getCountry();

        if (ckoHelper.isMADAPaymentsEnabled() && countryCode === 'SA') {
            madaBins = ckoMadaConfig[binType] || {};
        }

        res.json({
            error: false,
            madaBins: madaBins
        });
        return next();
        
    } catch (e) {
        res.json({
            error: true,
            errorObj: e
        });
        return next();
    }
});

/**
 * Verifies Cartes Bancaires Bin
 * @return {Object} The response object
 */
server.post('VerifyCartesBancaireBin', function(req, res, next) {
    var mode = ckoHelper.getValue(constants.CKO_MODE);
    var serviceName = 'cko.cartes.bancaires.' + mode + '.service';
    var cardBin = req.form.cardBin;
    try {
        var responseObj = ckoHelper.gatewayClientRequest(
            serviceName,
            {
                "source": {
                    "type": "bin",
                    "bin": cardBin
                },
                "format": "basic"
            }
        );
        if (responseObj) {
            res.json({
                error: false,
                res: responseObj
            });
            return next();
        }
        res.json({
            error: true
        });
        return next();
    } catch (error ) {
        res.json({
            error: true,
            errorObject: error
        });
        return next();
    }
    return next();
});

/*
 * Module exports
 */
module.exports = server.exports();
