'use strict';

//  API Includes
var Site = require('dw/system/Site');
var siteControllerName = Site.getCurrent().getCustomPreferenceValue('ckoSgStorefrontControllers');
var guard = require(siteControllerName + '/cartridge/scripts/guard');
var BasketMgr = require('dw/order/BasketMgr');

// Utility
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');

/**
 * Initiate the GooglePay session
 * @returns {string} The GooglePay response
 */
function googlePaySession() {
    try {
        // Prepare the basket
        var basket = BasketMgr.getCurrentBasket();
        var ckoMode = ckoHelper.getValue('ckoMode');
        var mode = dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMode'); // eslint-disable-line
        var currency = basket.getCurrencyCode();

        var gPayData = {
            mode: mode === '' || mode === 'sandbox' ? 'TEST' : 'PRODUCTION',
            environment: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoGooglePayEnvironment'), // eslint-disable-line
            googlePayMerchantId: ckoHelper.getValue('ckoGooglePayMerchantId'),
            totalAmount: basket.getTotalGrossPrice().value.toString(),
            currency: currency.toUpperCase(),
            gatewayMerchantId: ckoHelper.getValue('cko' + ckoMode.charAt(0).toUpperCase() + ckoMode.slice(1) + 'PublicKey'),
            merchantName: ckoHelper.getValue('ckoBusinessName') !== null ? ckoHelper.getValue('ckoBusinessName') : '',
        };

        return ckoHelper.ckoResponse(gPayData);
    } catch (e) {
        return ckoHelper.ckoResponse(e);
    }
}

// Module exports
exports.GooglePaySession = guard.ensure(['get', 'https'], googlePaySession);
