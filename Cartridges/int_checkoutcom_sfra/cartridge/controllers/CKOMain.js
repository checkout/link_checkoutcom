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

var cartHelper = require('*/cartridge/scripts/cart/cartHelpers');
var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
var CartModel = require('*/cartridge/models/cart');
var URLUtils = require('dw/web/URLUtils');

/* Checkout.com Event functions */
var eventsHelper = require('*/cartridge/scripts/helpers/eventsHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

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
                        order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                        order.setConfirmationStatus(order.CONFIRMATION_STATUS_NOTCONFIRMED);
                        OrderMgr.failOrder(order, true);
                    });
                    paymentHelper.getFailurePageRedirect(res);
                } else {
                    Transaction.wrap(function() {
                        // Payment status: PAID if gateway confirms Captured, NOT PAID if Pending
                        if (gVerify.status === 'Captured') {
                            order.setPaymentStatus(order.PAYMENT_STATUS_PAID);
                        } else {
                            order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                        }
                        order.setConfirmationStatus(order.CONFIRMATION_STATUS_CONFIRMED);
                    });

                    // Show the order confirmation page
                    paymentHelper.getConfirmationPageRedirect(res, order);
                }
            } else {
                Transaction.wrap(function() {
                    order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                    order.setConfirmationStatus(order.CONFIRMATION_STATUS_NOTCONFIRMED);
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

                // Fail the order and set payment/confirmation status explicitly
                Transaction.wrap(function() {
                    order.setPaymentStatus(order.PAYMENT_STATUS_NOTPAID);
                    order.setConfirmationStatus(order.CONFIRMATION_STATUS_NOTCONFIRMED);
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
            if (typeof eventsHelper[func] === 'function') {
                eventsHelper[func](hook);
            }

            // MB WAY: store capture/error webhook events in the webhookNotification custom object
            // so the client-side polling loop can detect them and act accordingly.
            var isMbway = hook.data && hook.data.metadata && hook.data.metadata.payment_processor === 'CHECKOUTCOM_MBWAY';
            if (isMbway) {
                var mbwayNotificationEvents = [
                    'payment_capture_pending',
                    'payment_captured',
                    'payment_declined',
                    'payment_expired',
                ];
                if (mbwayNotificationEvents.indexOf(hook.type) !== -1) {
                    var mbwayHelperInst = require('*/cartridge/scripts/helpers/mbwayHelper');
                    mbwayHelperInst.storeWebhookNotification(hook.data.reference, hook);
                }
            }

            // Bizum: store relevant webhook events in the webhookNotification custom object
            // so the client-side polling loop can detect them and act accordingly.
            var isBizum = hook.data && hook.data.metadata && hook.data.metadata.payment_processor === 'CHECKOUTCOM_BIZUM';
            if (isBizum) {
                var bizumNotificationEvents = [
                    'payment_pending',
                    'payment_capture_pending',
                    'payment_captured',
                    'payment_declined',
                    'payment_expired',
                ];
                if (bizumNotificationEvents.indexOf(hook.type) !== -1) {
                    var bizumHelperInst = require('*/cartridge/scripts/helpers/bizumHelper');
                    bizumHelperInst.storeWebhookNotification(hook.data.reference, hook);
                }
            }

            // ACH: store relevant webhook events in the webhookNotification custom object
            // so the client-side polling loop can detect them and act accordingly.
            // bank_account_updated is also stored so the processor token can be deleted.
            var isAch = hook.data && hook.data.metadata && hook.data.metadata.payment_processor === 'CHECKOUTCOM_ACH';
            if (isAch) {
                var achNotificationEvents = [
                    'payment_pending',
                    'payment_capture_pending',
                    'payment_captured',
                    'payment_declined',
                    'payment_expired',
                    'bank_account_updated',
                ];
                if (achNotificationEvents.indexOf(hook.type) !== -1) {
                    var achHelperInst = require('*/cartridge/scripts/helpers/achHelper');
                    achHelperInst.storeWebhookNotification(hook.data.reference, hook);
                }
            }
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
 * Polls the webhookNotification custom object to determine MB WAY payment outcome.
 * On payment_capture_pending: places the order and returns the confirmation URL.
 * On payment_declined / payment_expired: returns the failure URL.
 * Otherwise: returns pending status so the client continues polling.
 * @returns {Object} JSON response with status and optional redirect URL
 */
server.get('CheckMBWayWebhook', server.middleware.https, function(req, res, next) {
    var orderNo = req.querystring.orderNo;
    var token = req.querystring.token;
    var order = OrderMgr.getOrder(orderNo);

    if (!order || order.orderToken !== token) {
        res.json({ status: 'error' });
        return next();
    }

    var mbwayHelperInst = require('*/cartridge/scripts/helpers/mbwayHelper');
    var notification = mbwayHelperInst.getWebhookNotification(orderNo);

    if (!notification) {
        res.json({ status: 'pending' });
        return next();
    }

    var eventType = notification.webhookType;

    if (eventType === 'payment_capture_pending' || eventType === 'payment_captured') {
        // Place the order if not already placed
        var placeOrderResult;
        try {
            placeOrderResult = COHelpers.placeOrder(order, { status: '' });
        } catch (e) {
            // Order may already be placed (race condition on second poll)
            placeOrderResult = { error: false };
        }

        if (placeOrderResult && placeOrderResult.error) {
            res.json({ status: 'error' });
            return next();
        }

        // Clean up the notification so subsequent polls don't re-place
        mbwayHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'confirmed',
            confirmUrl: URLUtils.https(
                'Order-Confirm',
                'ID', order.orderNo,
                'token', order.orderToken
            ).toString(),
        });
    } else if (eventType === 'payment_declined' || eventType === 'payment_expired') {
        mbwayHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'failed',
            failureUrl: URLUtils.https(
                'Checkout-Begin',
                'stage', 'payment',
                'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)
            ).toString(),
        });
    } else {
        res.json({ status: 'pending' });
    }

    return next();
});

/**
 * Polls the webhookNotification custom object to determine Bizum payment outcome.
 * On payment_capture_pending: places the order and returns the confirmation URL.
 * On payment_declined / payment_expired: returns the failure URL.
 * On payment_pending: returns pending status so the client continues polling.
 * Otherwise: returns pending status so the client continues polling.
 * @returns {Object} JSON response with status and optional redirect URL
 */
server.get('CheckBizumWebhook', server.middleware.https, function(req, res, next) {
    var orderNo = req.querystring.orderNo;
    var token = req.querystring.token;
    var order = OrderMgr.getOrder(orderNo);

    if (!order || order.orderToken !== token) {
        res.json({ status: 'error' });
        return next();
    }

    var bizumHelperInst = require('*/cartridge/scripts/helpers/bizumHelper');
    var notification = bizumHelperInst.getWebhookNotification(orderNo);

    if (!notification) {
        res.json({ status: 'pending' });
        return next();
    }

    var eventType = notification.webhookType;

    if (eventType === 'payment_capture_pending' || eventType === 'payment_captured') {
        // Place the order if not already placed
        var placeOrderResult;
        try {
            placeOrderResult = COHelpers.placeOrder(order, { status: '' });
        } catch (e) {
            // Order may already be placed (race condition on second poll)
            placeOrderResult = { error: false };
        }

        if (placeOrderResult && placeOrderResult.error) {
            res.json({ status: 'error' });
            return next();
        }

        // Clean up the notification so subsequent polls don't re-place
        bizumHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'confirmed',
            confirmUrl: URLUtils.https(
                'Order-Confirm',
                'ID', order.orderNo,
                'token', order.orderToken
            ).toString(),
        });
    } else if (eventType === 'payment_declined' || eventType === 'payment_expired') {
        bizumHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'failed',
            failureUrl: URLUtils.https(
                'Checkout-Begin',
                'stage', 'payment',
                'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)
            ).toString(),
        });
    } else {
        // payment_pending or any other event — keep polling
        res.json({ status: 'pending' });
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

server.post('GetShippingMethods', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
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
server.post('VerifyCartesBancaireBin', csrfProtection.validateAjaxRequest, function(req, res, next) {
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

/**
 * Handles Basket Creation when the user clicks on Google pay and Paypal Express in PDP Page
 * @returns {string} The controller response
 */
server.post('CreateBasketForPDP', csrfProtection.validateAjaxRequest, function(req, res, next) {
    var existingBasket = BasketMgr.getCurrentBasket();
    var tempPliRecords = {};
    if (existingBasket) {
        Transaction.wrap(function() {
            var productLineItems = existingBasket.getAllProductLineItems().iterator();
            while (productLineItems.hasNext()) {
                var productLineItem = productLineItems.next();
                if (!productLineItem.optionProductLineItem) {
                    var options = '';
                    if (productLineItem.optionProductLineItems && productLineItem.optionProductLineItems.length > 0) {
                        var optionProductLineItemRecord = productLineItem.optionProductLineItems[0];
                        options = [{
                            optionId: optionProductLineItemRecord.optionID,
                            selectedValueId: optionProductLineItemRecord.optionValueID,
                        }];
                        options = JSON.stringify(options);
                    }
                    tempPliRecords[productLineItem.productID] = {
                        productID: productLineItem.productID,
                        quantityValue: productLineItem.quantityValue,
                        options: options,
                    };
                }
                existingBasket.removeProductLineItem(productLineItem);
            }
        });
        session.privacy.temporaryBasketPlis = JSON.stringify(tempPliRecords);
    }

    var currentBasket = BasketMgr.getCurrentOrNewBasket();

    var previousBonusDiscountLineItems = currentBasket.getBonusDiscountLineItems();
    var productId = req.form.pid;
    var childProducts = [];
    var options = req.form.options ? JSON.parse(req.form.options) : [];
    var quantity;
    var cartResult;

    if (productId !== 'null') {
        if (currentBasket) {
            Transaction.wrap(function() {
                quantity = 1;
                cartResult = cartHelper.addProductToCart(
                    currentBasket,
                    productId,
                    quantity,
                    childProducts,
                    options
                );
                if (!cartResult.error) {
                    cartHelper.ensureAllShipmentsHaveMethods(currentBasket);
                    basketCalculationHelpers.calculateTotals(currentBasket);
                }
            });
        }

        var cartModel = new CartModel(currentBasket);

        var urlObject = {
            url: URLUtils.url('Cart-ChooseBonusProducts').toString(),
            configureProductstUrl: URLUtils.url('Product-ShowBonusProducts').toString(),
            addToCartUrl: URLUtils.url('Cart-AddBonusProducts').toString(),
        };

        var newBonusDiscountLineItem = cartHelper.getNewBonusDiscountLineItem(
            currentBasket,
            previousBonusDiscountLineItems,
            urlObject,
            cartResult.uuid
        );
        if (newBonusDiscountLineItem) {
            var allLineItems = currentBasket.allProductLineItems;
            var collections = require('*/cartridge/scripts/util/collections');
            collections.forEach(allLineItems, function(pli) {
                if (pli.UUID === cartResult.uuid) {
                    Transaction.wrap(function() {
                        pli.custom.bonusProductLineItemUUID = 'bonus'; // eslint-disable-line no-param-reassign
                        pli.custom.preOrderUUID = pli.UUID; // eslint-disable-line no-param-reassign
                    });
                }
            });
        }

        cartHelper.getReportingUrlAddToCart(currentBasket, cartResult.error);
    }

    res.json({
        success: !cartResult.error,
        error: cartResult.error,
    });

    return next();
});

server.post('restoreTemporaryBasket', csrfProtection.validateAjaxRequest, function(req, res, next) {
    ckoHelper.restoreBasket();
});

/**
 * Polls the webhookNotification custom object to determine ACH payment outcome.
 * On payment_pending: returns pending status so the client continues to show the spinner.
 * On payment_capture_pending: places the order and returns the confirmation URL.
 * On payment_declined / payment_expired: returns the failure URL.
 * Otherwise: returns pending status so the client continues polling.
 * @returns {Object} JSON response with status and optional redirect URL
 */
server.get('CheckAchWebhook', server.middleware.https, function(req, res, next) {
    var orderNo = req.querystring.orderNo;
    var token = req.querystring.token;
    var order = OrderMgr.getOrder(orderNo);

    if (!order || order.orderToken !== token) {
        res.json({ status: 'error' });
        return next();
    }

    var achHelperInst = require('*/cartridge/scripts/helpers/achHelper');
    var notification = achHelperInst.getWebhookNotification(orderNo);

    if (!notification) {
        res.json({ status: 'pending' });
        return next();
    }

    var eventType = notification.webhookType;

    if (eventType === 'payment_capture_pending' || eventType === 'payment_captured') {
        // Shopper approved payment in banking portal — place the order
        var placeOrderResult;
        try {
            placeOrderResult = COHelpers.placeOrder(order, { status: '' });
        } catch (e) {
            // Order may already be placed (race condition on second poll)
            placeOrderResult = { error: false };
        }

        if (placeOrderResult && placeOrderResult.error) {
            res.json({ status: 'error' });
            return next();
        }

        achHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'confirmed',
            confirmUrl: URLUtils.https(
                'Order-Confirm',
                'ID', order.orderNo,
                'token', order.orderToken
            ).toString(),
        });
    } else if (eventType === 'payment_declined') {
        // eventsHelper.paymentDeclined already called OrderMgr.failOrder — do NOT call it again
        achHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'failed',
            failureUrl: URLUtils.https(
                'Checkout-Begin',
                'stage', 'payment',
                'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)
            ).toString(),
        });
    } else if (eventType === 'payment_expired') {
        // AC11: server does NOT fail the order for ACH payment_expired,
        // but the client must stop polling and allow the shopper to retry.
        achHelperInst.deleteWebhookNotification(orderNo);

        res.json({
            status: 'failed',
            failureUrl: URLUtils.https(
                'Checkout-Begin',
                'stage', 'payment',
                'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)
            ).toString(),
        });
    } else {
        // payment_pending, bank_account_updated, or any other event — keep polling
        res.json({ status: 'pending' });
    }

    return next();
});

/**
 * Calls the Plaid /link/token/create API to obtain a Link token for the client-side
 * Plaid Link popup. Reads Plaid credentials from SFCC site preferences.
 * @returns {Object} JSON response with linkToken or error flag
 */
server.post('GetPlaidLinkToken', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    var Site = require('dw/system/Site');
    var plaidService = require('*/cartridge/scripts/services/plaid');

    var orderNo = req.form.orderNo;
    var token = req.form.token;
    var order = OrderMgr.getOrder(orderNo);

    var failureUrl = URLUtils.https(
        'Checkout-Begin',
        'stage', 'payment',
        'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)
    ).toString();

    if (!order || order.orderToken !== token) {
        res.json({ error: true, failureUrl: failureUrl });
        return next();
    }

    try {
        var plaidClientId = Site.getCurrent().getCustomPreferenceValue('ckoPlaidClientId');
        var plaidSecret = Site.getCurrent().getCustomPreferenceValue('ckoPlaidSecret');
        var plaidClientName = Site.getCurrent().getCustomPreferenceValue('ckoPlaidClientName');

        if (!plaidClientId || !plaidSecret || !plaidClientName) {
            ckoHelper.log('GetPlaidLinkToken', 'Plaid credentials not configured in Site Preferences.');
            Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
            res.json({ error: true, failureUrl: failureUrl });
            return next();
        }

        var mode = ckoHelper.getValue('ckoMode');
        var service = (mode === 'live') ? plaidService.live() : plaidService.sandbox();

        var resp = service.call({
            endpoint: '/link/token/create',
            body: {
                client_id: plaidClientId,
                secret: plaidSecret,
                client_name: plaidClientName,
                user: { client_user_id: order.orderNo },
                products: ['auth'],
                country_codes: ['US'],
                language: 'en',
            },
        });

        if (resp.status === 'OK' && resp.object && resp.object.statusCode === 200) {
            var plaidResponse = JSON.parse(resp.object.text);
            res.json({ error: false, linkToken: plaidResponse.link_token });
        } else {
            ckoHelper.log('GetPlaidLinkToken error', resp.errorMessage || (resp.object && resp.object.text));
            Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
            res.json({ error: true, failureUrl: failureUrl });
        }
    } catch (e) {
        ckoHelper.log('GetPlaidLinkToken exception', e.message);
        Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
        res.json({ error: true, failureUrl: failureUrl });
    }

    return next();
});

/**
 * Completes the Plaid token exchange and submits the ACH payment to Checkout.com.
 * Steps:
 *   1. Exchange publicToken → accessToken via Plaid /item/public_token/exchange
 *   2. Create processor token via Plaid /processor/token/create
 *   3. Save processor token to the customer Profile (AC6b)
 *   4. Submit payment to Checkout.com using the processor token
 * @returns {Object} JSON response with error flag and pending status
 */
server.post('ProcessAchPayment', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    var Site = require('dw/system/Site');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var plaidService = require('*/cartridge/scripts/services/plaid');

    var orderNo = req.form.orderNo;
    var token = req.form.token;
    var publicToken = req.form.publicToken;
    var accountId = req.form.accountId;

    var order = OrderMgr.getOrder(orderNo);

    var failureUrl = URLUtils.https(
        'Checkout-Begin',
        'stage', 'payment',
        'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)
    ).toString();

    if (!order || order.orderToken !== token || !publicToken || !accountId) {
        res.json({ error: true, failureUrl: failureUrl });
        return next();
    }

    try {
        var plaidClientId = Site.getCurrent().getCustomPreferenceValue('ckoPlaidClientId');
        var plaidSecret = Site.getCurrent().getCustomPreferenceValue('ckoPlaidSecret');
        var mode = ckoHelper.getValue('ckoMode');

        // Step 1: Exchange public token for access token
        var exchangeService = (mode === 'live') ? plaidService.live() : plaidService.sandbox();
        var exchangeResp = exchangeService.call({
            endpoint: '/item/public_token/exchange',
            body: {
                client_id: plaidClientId,
                secret: plaidSecret,
                public_token: publicToken,
            },
        });

        if (exchangeResp.status !== 'OK' || !exchangeResp.object || exchangeResp.object.statusCode !== 200) {
            ckoHelper.log('ProcessAchPayment exchange error', exchangeResp.errorMessage || (exchangeResp.object && exchangeResp.object.text));
            Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
            res.json({ error: true, failureUrl: failureUrl });
            return next();
        }

        var accessToken = JSON.parse(exchangeResp.object.text).access_token;

        // Step 2: Create processor token
        var processorService = (mode === 'live') ? plaidService.live() : plaidService.sandbox();
        var processorResp = processorService.call({
            endpoint: '/processor/token/create',
            body: {
                client_id: plaidClientId,
                secret: plaidSecret,
                access_token: accessToken,
                account_id: accountId,
                processor: 'checkout',
            },
        });

        if (processorResp.status !== 'OK' || !processorResp.object || processorResp.object.statusCode !== 200) {
            ckoHelper.log('ProcessAchPayment processor token error', processorResp.errorMessage || (processorResp.object && processorResp.object.text));
            Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
            res.json({ error: true, failureUrl: failureUrl });
            return next();
        }

        var processorToken = JSON.parse(processorResp.object.text).processor_token;

        // Step 3: Save processor token to customer profile (AC6b)
        var achHelperInst = require('*/cartridge/scripts/helpers/achHelper');
        if (order.getCustomer() && order.getCustomer().isAuthenticated()) {
            achHelperInst.saveProcessorToken(order.getCustomer(), processorToken);
        }

        // Step 4: Submit payment to Checkout.com
        var achPaymentHelper = require('*/cartridge/scripts/helpers/achPaymentHelper');
        var paymentResult = achPaymentHelper.handleRequest('CHECKOUTCOM_ACH', orderNo, processorToken);

        if (paymentResult.error) {
            Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
            res.json({ error: true, failureUrl: failureUrl });
            return next();
        }

        // Record the transaction ID on the payment instrument
        Transaction.wrap(function() {
            var paymentInstruments = order.getPaymentInstruments('CHECKOUTCOM_ACH');
            if (paymentInstruments && paymentInstruments.length > 0) {
                var paymentProcessor = PaymentMgr.getPaymentMethod('CHECKOUTCOM_ACH').getPaymentProcessor();
                paymentInstruments[0].paymentTransaction.setTransactionID(paymentResult.transactionID);
                paymentInstruments[0].paymentTransaction.setPaymentProcessor(paymentProcessor);
            }
        });

        res.json({ error: false, pending: true });
    } catch (e) {
        ckoHelper.log('ProcessAchPayment exception', e.message);
        Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
        res.json({ error: true, failureUrl: failureUrl });
    }

    return next();
});

/*
 * Module exports
 */
module.exports = server.exports();
