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
        var currency = basket.getCurrencyCode();

        gPayData = {
            mode: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMode').value,
            environment: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMode').value,
            totalAmount: ckoHelper.getFormattedPrice(basket.getTotalGrossPrice().value, currency),
            currency: basket.getCurrencyCode(),
            gatewayMerchantId: ckoHelper.getValue('cko' + ckoMode.value.charAt(0).toUpperCase() + ckoMode.value.slice(1) + 'PublicKey')
        };

        return ckoHelper.ckoResponse(gPayData);

    } catch (e) {

        return ckoHelper.ckoResponse(e.message);
        
    }

}

// Module exports
exports.GooglePaySession = guard.ensure(['get', 'https'], googlePaySession);
