'use strict';

var server = require('server');
var BasketMgr = require('dw/order/BasketMgr');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');

var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var tabbyHelper = require('*/cartridge/scripts/helpers/tabbyHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var constants = require('*/cartridge/config/constants');

/**
 * Calls the Checkout.com Payment Context API for Tabby.
 * Validates whether Tabby installments are available for the current order.
 * Stores payment_context_id and payment_type in session on success.
 * AC3, AC4, AC5
 */
server.post('CreateContext', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.setStatusCode(400);
        res.json({ error: true, message: Resource.msg('cko.tabby.error.unavailable', 'cko', null) });
        return next();
    }

    try {
        var requestData = tabbyHelper.buildContextRequest(currentBasket);
        var serviceId = 'cko.payment.contexts.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';
        var responseData = ckoHelper.createContext(serviceId, requestData, 'POST');

        if (responseData.status === 'OK') {
            var responseObject = responseData.object;

            if (responseObject.available_payment_types && responseObject.available_payment_types.length > 0) {
                var paymentType = responseObject.available_payment_types[0].payment_type || 'Installment';
                req.session.privacyCache.set('ckoTabbyContextId', responseObject.id);
                req.session.privacyCache.set('ckoTabbyPaymentType', paymentType);

                res.json({ success: true });
                return next();
            }
        }

        res.setStatusCode(422);
        res.json({
            error: true,
            message: Resource.msg('cko.tabby.error.unavailable', 'cko', null),
        });
    } catch (error) {
        Logger.error('Error creating Tabby payment context: ' + error.message);
        res.setStatusCode(500);
        res.json({
            error: true,
            message: Resource.msg('cko.tabby.error.unavailable', 'cko', null),
        });
    }

    return next();
});

module.exports = server.exports();
