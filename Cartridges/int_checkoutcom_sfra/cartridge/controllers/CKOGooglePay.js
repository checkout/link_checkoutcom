/**
 * Klarna controller.
 */

'use strict';

/* Server */
var server = require('server');

/* API Includes */
var BasketMgr = require('dw/order/BasketMgr');

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
        //eslint-disable-next-line
        var mode = dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMode');
        var currency = basket.getCurrencyCode();

        var gPayData = {
            mode: mode === '' || mode === 'sandbox' ? 'TEST' : 'PRODUCTION',
            //eslint-disable-next-line
            environment: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoGooglePayEnvironment'),
            googlePayMerchantId: ckoHelper.getValue('ckoGooglePayMerchantId'),
            totalAmount: basket.getTotalGrossPrice().value.toString(),
            currency: currency.toUpperCase(),
            gatewayMerchantId: ckoHelper.getValue('cko' + ckoMode.charAt(0).toUpperCase() + ckoMode.slice(1) + 'PublicKey'),
            merchantName: ckoHelper.getValue('ckoBusinessName') !== null ? ckoHelper.getValue('ckoBusinessName') : '',
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
