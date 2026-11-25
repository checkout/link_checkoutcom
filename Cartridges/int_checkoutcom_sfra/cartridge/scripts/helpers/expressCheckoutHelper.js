'use strict';

/* API Includes */
var Site = require('dw/system/Site');

/* Checkout helpers */
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/**
 * The gates of CheckoutServices-PlaceOrder, for the express checkout routes
 * (GooglePay-ExpressCheckout, PayPal-ExpressCheckout): a basket the standard
 * checkout refuses is refused by the express routes too.
 */
var expressCheckoutHelper = {
    /**
     * Whether the merchant offers the express checkout of a payment method.
     * @param {string} paymentMethodId CHECKOUTCOM_GOOGLE_PAY or CHECKOUTCOM_PAYPAL
     * @returns {boolean} True when the express checkout is switched on
     */
    isEnabled: function(paymentMethodId) {
        var site = Site.getCurrent();

        if (paymentMethodId === 'CHECKOUTCOM_GOOGLE_PAY') {
            return !!site.getCustomPreferenceValue('ckoGooglePayEnabled');
        }

        if (paymentMethodId === 'CHECKOUTCOM_PAYPAL') {
            return !!site.getCustomPreferenceValue('ckoPayPalEnabled') && (
                !!site.getCustomPreferenceValue('ckoPayPalEnabledOnPDP')
                || !!site.getCustomPreferenceValue('ckoPayPalEnabledOnMinCart')
                || !!site.getCustomPreferenceValue('ckoPayPalEnabledOnCart')
            );
        }

        return false;
    },

    /**
     * The checks made before the basket is turned into an order: the session's
     * fraud block, the express switch, and the product and order validations.
     * @param {Object} req The request
     * @param {dw.order.Basket} basket The current basket
     * @param {string} paymentMethodId The express payment method
     * @returns {boolean} True when the basket may be ordered
     */
    canOrder: function(req, basket, paymentMethodId) {
        if (!basket || req.session.privacyCache.get('fraudDetectionStatus') || !this.isEnabled(paymentMethodId)) {
            return false;
        }

        var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');

        if (validationHelpers.validateProducts(basket).error) {
            return false;
        }

        var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
        var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', basket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);

        return !validationOrderStatus.error;
    },

    /**
     * Create the order from a basket whose express payment instrument is set:
     * only when the payment method applies to this shopper, country and amount,
     * and the payment transactions add up.
     * @param {Object} req The request
     * @param {dw.order.Basket} basket The current basket
     * @returns {dw.order.Order|null} The order, or null when it may not be created
     */
    createOrder: function(req, basket) {
        if (COHelpers.calculatePaymentTransaction(basket).error) {
            return null;
        }

        if (COHelpers.validatePayment(req, basket).error) {
            return null;
        }

        return COHelpers.createOrder(basket) || null;
    },
};

module.exports = expressCheckoutHelper;
