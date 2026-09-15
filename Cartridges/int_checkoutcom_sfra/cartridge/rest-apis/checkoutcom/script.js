'use strict';

/**
 * Implementation of the Checkout.com Payments Custom API (see schema.yaml).
 * These endpoints expose the transport-neutral payment scripts to headless
 * storefronts (Storefront Next / PWA Kit) over SCAPI.
 */

var RESTResponseMgr = require('dw/system/RESTResponseMgr');

/**
 * Parse the JSON request body.
 * @returns {Object|null} The parsed body, or null when invalid
 */
function getRequestBody() {
    try {
        // eslint-disable-next-line no-undef
        return JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (e) {
        return null;
    }
}

/**
 * POST /payment-status
 * Check the webhook-recorded outcome of an async payment and place the order
 * on approval.
 */
exports.checkPaymentStatus = function() {
    var OrderMgr = require('dw/order/OrderMgr');
    var paymentStatusHelper = require('*/cartridge/scripts/checkout/paymentStatusHelper');

    var body = getRequestBody();
    if (!body || !body.orderNo || !body.orderToken) {
        RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', 'orderNo and orderToken are required.').render();
        return;
    }

    var order = OrderMgr.getOrder(body.orderNo);
    if (!order || order.orderToken !== body.orderToken) {
        RESTResponseMgr.createError(404, 'order-not-found', 'Order Not Found', 'The order does not exist or the token does not match.').render();
        return;
    }

    var paymentMethodId = paymentStatusHelper.getAsyncPaymentMethod(order);
    if (!paymentMethodId) {
        RESTResponseMgr.createSuccess({ status: 'unsupported' }).render();
        return;
    }

    var result = paymentStatusHelper.checkAsyncPaymentStatus(order, paymentMethodId);
    RESTResponseMgr.createSuccess({ status: result.status }).render();
};
exports.checkPaymentStatus.public = true;

/**
 * GET /apm-eligibility
 * Evaluate which Checkout.com methods are eligible for a country/currency.
 */
exports.getApmEligibility = function() {
    var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
    var ckoApmFilterConfig = require('*/cartridge/config/ckoApmFilterConfig');

    // eslint-disable-next-line no-undef
    var country = request.getHttpParameterMap().get('c_country').getStringValue();
    // eslint-disable-next-line no-undef
    var currency = request.getHttpParameterMap().get('c_currency').getStringValue();

    if (!country || !currency) {
        RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', 'c_country and c_currency are required.').render();
        return;
    }

    var methods = {};

    // Redirect APMs from the shared filter configuration
    Object.keys(ckoApmFilterConfig).forEach(function(key) {
        var entry = ckoApmFilterConfig[key];
        methods[key] = entry.enabled === true
            && entry.countries.indexOf(country) !== -1
            && entry.currencies.indexOf(currency) !== -1;
    });

    // Standalone methods gated by their site preference flags; country and
    // currency applicability is enforced by the payment method configuration.
    methods.klarna = ckoHelper.getValue('ckoKlarnaEnabled') === true;
    methods.alma = ckoHelper.getValue('ckoAlmaEnabled') === true;
    methods.sequra = ckoHelper.getValue('ckoSequraEnabled') === true;
    methods.tabby = ckoHelper.getValue('ckoTabbyEnabled') === true;
    methods.mbway = ckoHelper.getValue('ckoMbwayEnabled') === true;
    methods.bizum = ckoHelper.getValue('ckoBizumEnabled') === true;
    methods.ach = ckoHelper.getValue('ckoAchEnabled') === true;

    RESTResponseMgr.createSuccess({
        country: country,
        currency: currency,
        methods: methods,
    }).render();
};
exports.getApmEligibility.public = true;

/**
 * GET /bin-lookup
 * Look up Mada and Cartes Bancaires scheme membership for a card BIN.
 */
exports.getBinLookup = function() {
    var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
    var constants = require('*/cartridge/config/constants');

    // eslint-disable-next-line no-undef
    var bin = request.getHttpParameterMap().get('c_bin').getStringValue();
    if (!bin) {
        RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', 'c_bin is required.').render();
        return;
    }

    var isMada = false;
    try {
        isMada = ckoHelper.isMadaCard(bin, { type: 'creditCard' }) === true;
    } catch (e) {
        isMada = false;
    }

    var isCartesBancaires = false;
    try {
        var responseObj = ckoHelper.gatewayClientRequest(
            'cko.cartes.bancaires.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            {
                source: {
                    type: 'bin',
                    bin: bin,
                },
                format: 'basic',
            }
        );
        isCartesBancaires = !!(responseObj && responseObj.scheme_local === 'cartes_bancaires');
    } catch (e) {
        isCartesBancaires = false;
    }

    RESTResponseMgr.createSuccess({
        isMada: isMada,
        isCartesBancaires: isCartesBancaires,
    }).render();
};
exports.getBinLookup.public = true;

/**
 * POST /payment-contexts
 * Create a Checkout.com payment context (Klarna, Tabby) for the current basket.
 */
exports.createPaymentContext = function() {
    var BasketMgr = require('dw/order/BasketMgr');
    var contextHelper = require('*/cartridge/scripts/checkout/contextHelper');

    var body = getRequestBody();
    if (!body || !body.type) {
        RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', 'type is required.').render();
        return;
    }

    var basket = BasketMgr.getCurrentBasket();
    if (!basket) {
        RESTResponseMgr.createError(404, 'basket-not-found', 'Basket Not Found', 'The shopper has no open basket.').render();
        return;
    }

    var result = contextHelper.createPaymentContext(basket, body.type, { billingCountry: body.billingCountry });
    if (!result.success) {
        RESTResponseMgr.createError(422, 'context-creation-failed', 'Payment Context Creation Failed', result.errorMessage || 'The payment context could not be created.').render();
        return;
    }

    RESTResponseMgr.createSuccess({
        id: result.id,
        paymentType: result.paymentType,
    }).render();
};
exports.createPaymentContext.public = true;

/**
 * POST /return
 * Complete the gateway redirect return leg: verify the session and place or
 * fail the order.
 */
exports.completeReturn = function() {
    var returnHandler = require('*/cartridge/scripts/checkout/returnHandler');

    var body = getRequestBody();
    if (!body || !body.ckoSessionId) {
        RESTResponseMgr.createError(400, 'invalid-request', 'Invalid Request', 'ckoSessionId is required.').render();
        return;
    }

    var result = body.success === false
        ? returnHandler.handleFail(body.ckoSessionId)
        : returnHandler.handleReturn(body.ckoSessionId);

    RESTResponseMgr.createSuccess({
        outcome: result.outcome,
        orderNo: result.order ? result.order.orderNo : null,
    }).render();
};
exports.completeReturn.public = true;
