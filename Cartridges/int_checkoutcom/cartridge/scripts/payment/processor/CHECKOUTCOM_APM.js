'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var Cart = require('*/cartridge/scripts/models/CartModel');
var app = require('*/cartridge/scripts/app');

// Utility
var apmHelper = require('*/cartridge/scripts/helpers/apmHelper');

// APM Configuration
var apmConfig = require('*/cartridge/config/ckoApmConfig');
var apmFilterConfig = require('*/cartridge/config/ckoApmFilterConfig');

/** The site preference enabling each APM (as templates/default/apm/apm.isml) */
var APM_PREFERENCES = {
    ideal: 'ckoIdealEnabled',
    boleto: 'ckoBoletoEnabled',
    bancontact: 'ckoBancontactEnabled',
    benefit: 'ckoBenefitEnabled',
    giro: 'ckoGiroEnabled',
    eps: 'ckoEpsEnabled',
    sofort: 'ckoSofortEnabled',
    knet: 'ckoKnetEnabled',
    qpay: 'ckoQpayEnabled',
    fawry: 'ckoFawryEnabled',
    multibanco: 'ckoMultibancoEnabled',
    poli: 'ckoPoliEnabled',
    p24: 'ckoP24Enabled',
    oxxo: 'ckoOxxoEnabled',
    ali: 'ckoAlipayEnabled',
    paypal: 'ckoPaypalEnabled',
};

/**
 * Whether the shopper may pay with this APM: enabled by the merchant, and
 * offered for the order's currency and the shopper's country (the checkout
 * page applies the same filter; the server does not take its word for it).
 * @param {string} apm The APM, as posted
 * @param {dw.order.Order} order The order
 * @returns {boolean} True when the APM may be used
 */
function isApmAvailable(apm, order) {
    var Site = require('dw/system/Site');
    var Locale = require('dw/util/Locale');

    if (typeof apm !== 'string' || !Object.prototype.hasOwnProperty.call(APM_PREFERENCES, apm)
        || !Site.getCurrent().getCustomPreferenceValue(APM_PREFERENCES[apm])
        || !Object.prototype.hasOwnProperty.call(apmConfig, apm + 'PayAuthorization')) {
        return false;
    }

    var filter = apmFilterConfig[apm === 'ali' ? 'alipay' : apm];

    if (!filter) {
        return true;
    }

    // eslint-disable-next-line no-undef
    var country = String(Locale.getLocale(request.getLocale()).getCountry() || '').toUpperCase();

    return filter.currencies.indexOf(String(order.getCurrencyCode())) !== -1
        && (filter.countries.indexOf('*') !== -1 || filter.countries.indexOf(country) !== -1);
}

/**
 * Verifies that the payment data is valid.
 * @param {Object} args The method arguments
 * @returns {Object} The form validation result
 */
function Handle(args) {
    // Proceed with transaction
    var cart = Cart.get(args.Basket);
    var paymentMethod = args.PaymentMethodID;

    // Proceed with transact
    Transaction.wrap(function() {
        cart.removeExistingPaymentInstruments(paymentMethod);
        cart.createPaymentInstrument(paymentMethod, cart.getNonGiftCertificateAmount());
    });

    return { success: true };
}

/**
 * Authorises a payment.
 * @param {Object} args The method arguments
 * @returns {Object} The payment success or failure
 */
function Authorize(args) {
    // Add order Number to session
    // eslint-disable-next-line
    session.privacy.ckoOrderId = args.OrderNo;

    // Get apms form
    var paymentForm = app.getForm('alternativePaymentForm');

    // Get apm type chosen
    var apm = paymentForm.get('alternative_payments').value();

    if (!isApmAvailable(apm, args.Order)) {
        return { error: true };
    }

    var func = apm + 'PayAuthorization';

    // Get the required apm pay config object
    var payObject = apmConfig[func](args);

    var apmAuthResult = apmHelper.apmAuthorization(payObject, args);
    if (apmAuthResult && apmAuthResult.redirected) {
        return { redirectURL: apmAuthResult.redirectUrl };
    } else if (apmAuthResult) {
        return { success: true };
    }

    return { error: true };
}

// Local methods
exports.Handle = Handle;
exports.Authorize = Authorize;
