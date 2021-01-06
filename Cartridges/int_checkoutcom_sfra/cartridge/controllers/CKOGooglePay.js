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
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');

/**
 * Initiate the GooglePay session.
 * @returns {string} The controller response
 */
server.get('GooglePaySession', function(req, res, next) {

    try {

        // Prepare the basket
        var basket = BasketMgr.getCurrentBasket();
        var ckoMode = ckoHelper.getValue('ckoMode');
        var currency = basket.getCurrencyCode();

        gPayData = {
            mode: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMode').value,
            environment: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMode').value,
            totalAmount: ckoHelper.getFormattedPrice(basket.getTotalGrossPrice().value, currency),
            currency: basket.getCurrencyCode(),
            gatewayMerchantId: ckoHelper.getValue('cko' + ckoMode.value.charAt(0).toUpperCase() + ckoMode.value.slice(1) + 'PublicKey')
        };

        res.json(gPayData);

    } catch (e) {

        return next(
            new Error(e.message)
        );
        
    }

    return next();
});

/*
 * Module exports
 */
module.exports = server.exports();
