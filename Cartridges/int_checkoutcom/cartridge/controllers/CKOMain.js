'use strict';

// API Includes
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');
var Order = app.getModel('Order');
var ISML = require('dw/template/ISML');
var OrderMgr = require('dw/order/OrderMgr');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var Locale = require('dw/util/Locale');
var DwOrder = require('dw/order/Order');
var Logger = require('dw/system/Logger');

// Checkout.com Event functions
var eventsHelper = require('*/cartridge/scripts/helpers/eventsHelper');

// Utility
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

// Apm Filter Configuration file
var ckoApmFilterConfig = require('*/cartridge/config/ckoApmFilterConfig');

// Card Mada Bins
var ckoMadaConfig = require('*/cartridge/config/ckoMadaConfig');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * The order this session sent to payment. A return or failure URL never names
 * the order it acts on: anyone can open one with another shopper's order number.
 * @returns {dw.order.Order|null} The order, or null
 */
function getSessionOrder() {
    // eslint-disable-next-line no-undef
    var orderNo = session.privacy.ckoOrderId;

    return orderNo ? OrderMgr.getOrder(orderNo) : null;
}

/**
 * Handles a failed payment from the Checkout.com payment gateway
 */
function handleFail() {
    // Only the session's own order, and only while it waits for its payment
    var order = getSessionOrder();

    if (order && order.getStatus().getValue() === DwOrder.ORDER_STATUS_CREATED) {
        // Restore the cart
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });
    }

    // Send back to the error page
    app.getController('COSummary').Start({
        PlaceOrderError: new Status(Status.ERROR, 'confirm.error.declined'),
    });
}

/**
 * Handles responses from the Checkout.com payment gateway
 */
function handleReturn() {
    var mode = ckoHelper.getValue(constants.CKO_MODE);
    var serviceName = 'cko.verify.charges.' + mode + '.service';
    var order = getSessionOrder();
    // eslint-disable-next-line no-undef
    var sessionId = request.httpParameterMap.get('cko-session-id').stringValue;

    if (!order || !sessionId) {
        // No order of this session, or nothing to verify: nothing is placed
        handleFail();

        return;
    }

    // The payment as Checkout.com has it, never as the return URL or a request body says
    var payment = ckoHelper.gatewayClientRequest(serviceName, { paymentToken: sessionId });

    if (order.getStatus().getValue() !== DwOrder.ORDER_STATUS_CREATED) {
        // A refresh, or a second visit: the order was placed or given up already
        if (ckoHelper.paysOrder(order, payment, { allowPending: true }) && order.getStatus().getValue() !== DwOrder.ORDER_STATUS_FAILED) {
            app.getController('COSummary').ShowConfirmation(order);
        } else {
            handleFail();
        }

        return;
    }

    if (!ckoHelper.paysOrder(order, payment, { allowPending: true })) {
        // Declined, expired, another order's payment, or not for this order's amount
        var found = payment ? [payment.id, payment.status, payment.amount, payment.currency, payment.reference].join(' ') : 'unreadable';

        Logger.getLogger('checkoutcom').warn('Order {0} not placed: the payment does not pay it ({1}).', order.getOrderNo(), found);
        handleFail();

        return;
    }

    var orderPlacementStatus = Order.submit(order);

    if (orderPlacementStatus.error) {
        Transaction.wrap(function() {
            OrderMgr.failOrder(order, true);
        });

        app.getController('COSummary').Start({
            PlaceOrderError: new Status(Status.ERROR, 'confirm.error.declined'),
        });

        return;
    }

    if (payment.status === 'Pending') {
        // Not paid yet (a voucher, a bank transfer): the order is not exported
        // until a webhook confirms the payment (eventsHelper releases it)
        Transaction.wrap(function() {
            order.setExportStatus(DwOrder.EXPORT_STATUS_NOTEXPORTED);
        });
    }

    app.getController('COSummary').ShowConfirmation(order);
}

/**
 * Handles webhook responses from the Checkout.com payment gateway
 * @returns {string} The response string
 */
function handleWebhook() {
    var isValidResponse = ckoHelper.isValidResponse();
    if (isValidResponse) {
        // Get the response as JSON object
        // eslint-disable-next-line
        var hook = JSON.parse(request.httpParameterMap.getRequestBodyAsString());

        // Check the webhook event
        if (hook !== null && Object.prototype.hasOwnProperty.call(hook, 'type')) {
            // Get a camel case function name from event type
            var func = '';
            var parts = hook.type.split('_');
            for (var i = 0; i < parts.length; i++) {
                func += (i === 0) ? parts[i] : parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
            }
            if (Object.prototype.hasOwnProperty.call(eventsHelper, func)) {
                Transaction.wrap(function() {
                    // Call the event
                    eventsHelper[func](hook);
                });
            }
        } else {
            // Write the response
            return ckoHelper.ckoResponse(null);
        }
    }

    // Write the response
    return ckoHelper.ckoResponse(null);
}

/**
 * Initializes the credit card list by determining the saved customer payment method
 */
function getCardsList() {
    var applicablePaymentCards;
    var data = [];

    // If user logged in
    // eslint-disable-next-line
    if (customer.authenticated) {
        var profile = customer.getProfile(); // eslint-disable-line
        if (profile) {
            applicablePaymentCards = customer.profile.getWallet().getPaymentInstruments(); // eslint-disable-line
            for (var i = 0; i < applicablePaymentCards.length; i++) {
                data.push({
                    cardId: applicablePaymentCards[i].getUUID(),
                    cardNumber: applicablePaymentCards[i].getCreditCardNumber(),
                    cardToken: applicablePaymentCards[i].getCreditCardToken(),
                    cardHolder: applicablePaymentCards[i].creditCardHolder,
                    cardType: applicablePaymentCards[i].getCreditCardType(),
                    expiryMonth: applicablePaymentCards[i].creditCardExpirationMonth,
                    expiryYear: applicablePaymentCards[i].creditCardExpirationYear,
                });
            }
        }

        // Send the output for rendering
        ISML.renderTemplate('custom/ajax/output.isml', { data: JSON.stringify(data) });
    } else {
        app.getModel('Customer').logout();
        app.getView().render('csrf/csrffailed');
    }
}

/**
 * Apms filter helper.
 * @returns {Object} The response object
 */
function getApmFilter() {
    try {
        // Prepare some variables
        var basket = BasketMgr.getCurrentBasket();
        var currencyCode = basket.getCurrencyCode();
        var countryCode = basket.defaultShipment.shippingAddress.countryCode.valueOf();

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
        return ckoHelper.ckoResponse(responseObject);
    } catch (e) {
        // Write the response
        return ckoHelper.ckoResponse(null);
    }
}

/**
 * Mada Bins helper.
 * @returns {Object} The response object
 */
function getMadaBin() {
    try {
        // eslint-disable-next-line no-undef
        var binType = request.httpParameterMap.get('type').stringValue;
        var madaBins = {};

        // eslint-disable-next-line no-undef
        var currentLocale = request.getLocale();
        var locale = Locale.getLocale(currentLocale);
        var countryCode = locale.getCountry();

        if (ckoHelper.isMADAPaymentsEnabled() && countryCode === 'SA') {
            madaBins = ckoMadaConfig[binType] || {};
        }

        // Write the response
        return ckoHelper.ckoResponse(madaBins);
    } catch (e) {
        // Write the response
        return ckoHelper.ckoResponse(null);
    }
}

/**
 * Verifies Cartes Bancaires Bin
 * @return {Object} The response object
 */
function verifyCartesBancaireBin() {
    var res = require('*/cartridge/scripts/util/Response');
    try {
        var mode = ckoHelper.getValue(constants.CKO_MODE);
        var serviceName = 'cko.cartes.bancaires.' + mode + '.service';
        var cardBin = request.httpParameterMap.cardBin.stringValue;
        if (cardBin) {
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
                res.renderJSON({
                    error: false,
                    res: responseObj
                });
                return;
            }
            res.renderJSON({
                error: true
            });
            return;
        }
    } catch (error) {
        res.renderJSON({
            error: true,
            errorObject: error
        });
        return;
    }
}

// Module exports
exports.HandleReturn = guard.ensure(['get', 'https'], handleReturn);
exports.HandleFail = guard.ensure(['get', 'https'], handleFail);
exports.HandleWebhook = guard.ensure(['post', 'https'], handleWebhook);
exports.GetCardsList = guard.ensure(['post', 'https'], getCardsList);
exports.GetApmFilter = guard.ensure(['get', 'https'], getApmFilter);
exports.GetMadaBin = guard.ensure(['get', 'https'], getMadaBin);
exports.VerifyCartesBancaireBin = guard.ensure(['post','https'], verifyCartesBancaireBin);
