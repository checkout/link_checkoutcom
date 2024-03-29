/**
 * Klarna controller.
 */

'use strict';

/* Server */
var server = require('server');

/* API Includes */
var BasketMgr = require('dw/order/BasketMgr');
var Resource = require('dw/web/Resource');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Initiate the Kalrna session.
 * @returns {string} The controller response
 */
server.get('KlarnaSession', server.middleware.https, function(req, res, next) {
    // Prepare the basket
    var basket = BasketMgr.getCurrentBasket();
    var countryCode = basket.defaultShipment.shippingAddress.countryCode.valueOf();

    if (Object.keys(basket).length !== 0) {
        // Prepare the variables
        var currency = basket.getCurrencyCode();
        var locale = ckoHelper.getLanguage();
        var total = ckoHelper.getFormattedPrice(basket.getTotalGrossPrice().value, currency);
        var tax = ckoHelper.getFormattedPrice(basket.getTotalTax().value, currency);
        var products = ckoHelper.getBasketObject(basket);

        // Prepare the request object
        var requestObject = {
            purchase_country: countryCode,
            currency: currency,
            locale: locale,
            amount: total,
            tax_amount: tax,
            products: products,
            billing_address: {
                email: basket.customerEmail,
            },
        };

        // Perform the request to the payment gateway
        var gSession = ckoHelper.gatewayClientRequest(
            'cko.klarna.session.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            requestObject
        );

        // Store variables in session
        gSession.requestObject = requestObject;
        gSession.addressInfo = {};

        // Write the session
        if (gSession) {
            res.json(gSession);
        }
    } else {
        return next(
            new Error(
                Resource.msg(
                    'cko.payment.invalid',
                    'cko',
                    null
                )
            )
        );
    }

    return next();
});

/*
 * Module exports
 */
module.exports = server.exports();
