'use strict';

// Site controller
var Site = require('dw/system/Site');
var SiteControllerName = Site.getCurrent().getCustomPreferenceValue('ckoSgStorefrontControllers');

// API Includes
var app = require(SiteControllerName + '/cartridge/scripts/app');
var OrderMgr = require('dw/order/OrderMgr');

// Business Name
var businessName = Site.getCurrent().getCustomPreferenceValue('ckoBusinessName');

// Utility
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');

/**
 * All APM configurations.
 */
var ckoApmConfig = {
    /**
     * Ideal Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    idealPayAuthorization: function(args) {
        var form = app.getForm('idealForm');
        // building ideal pay object
        var payObject = {
            source: {
                type: 'ideal',
                bic: form.get('ideal_bic').value(),
                description: args.OrderNo,
                language: ckoHelper.getLanguage(),
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };
        form.clear();

        return payObject;
    },

    /**
     * Boleto Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    boletoPayAuthorization: function(args) {
        var form = app.getForm('boletoForm');
        // Building pay object
        var payObject = {
            source: {
                type: 'boleto',
                integration_type: 'redirect',
                country: ckoHelper.getBillingCountry(args),
                payer: {
                    name: ckoHelper.getCustomerName(args),
                    email: ckoHelper.getCustomer(args).email,
                    document: form.get('boleto_cpf').value()
                },
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };
        form.clear();

        return payObject;
    },

    /**
     * Bancontact Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    bancontactPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            source: {
                type: 'bancontact',
                payment_country: ckoHelper.getBillingCountry(args),
                account_holder_name: ckoHelper.getCustomerName(args),
                billing_descriptor: businessName,
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * Benefit Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    benefitPayAuthorization: function(args) {
        // Process benefit pay
        var payObject = {
            source: {
                type: 'benefitpay',
                integration_type: 'web',
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * Giro Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    giroPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            source: {
                type: 'giropay',
                purpose: businessName,
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * EPS Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    epsPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            source: {
                type: 'eps',
                purpose: businessName,
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * Sofort Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    sofortPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            source: {
                type: 'sofort',
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * Knet Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    knetPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            source: {
                type: 'knet',
                language: ckoHelper.getLanguage().substr(0, 2),
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * Q Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    qpayPayAuthorization: function(args) {
        var form = app.getForm('qpayForm');
        // Building pay object
        var payObject = {
            source: {
                type: 'qpay',
                description: businessName,
                language: ckoHelper.getLanguage().substr(0, 2),
                quantity: ckoHelper.getProductQuantity(args),
                national_id: form.get('qpay_national_id').value()
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };
        form.clear();

        return payObject;
    },

    /**
     * Fawry Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    fawryPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            source: {
                type: 'fawry',
                description: businessName,
                customer_mobile: ckoHelper.getPhoneObject(args).number,
                customer_email: ckoHelper.getCustomer(args).email,
                products: ckoHelper.getProductInformation(args),
            },
            purpose: businessName,
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },

    /**
     * Sepa Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    sepaPayAuthorization: function(args) {
        var form = app.getForm('sepaForm');
        // Building pay object
        var payObject = {
            type: 'sepa',
            currency: ckoHelper.getCurrency(args),
            source_data: {
                first_name: ckoHelper.getCustomerFirstName(args),
                last_name: ckoHelper.getCustomerLastName(args),
                account_iban: form.get('sepa_iban').value(),
                billing_descriptor: businessName,
                mandate_type: 'single',
            },
        };
        form.clear();

        return payObject;
    },

    /**
     * Multibanco Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    multibancoPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            currency: ckoHelper.getCurrency(args),
            source: {
                type: 'multibanco',
                payment_country: ckoHelper.getBillingCountry(args),
                account_holder_name: ckoHelper.getCustomerName(args),
                billing_descriptor: businessName,
            },
        };

        return payObject;
    },

    /**
     * Poli Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    poliPayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            currency: ckoHelper.getCurrency(args),
            source: {
                type: 'poli',
            },
        };

        return payObject;
    },

    /**
     * P24 Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    p24PayAuthorization: function(args) {
        // Building pay object
        var payObject = {
            currency: ckoHelper.getCurrency(args),
            source: {
                type: 'p24',
                payment_country: ckoHelper.getBillingCountry(args),
                account_holder_name: ckoHelper.getCustomerName(args),
                account_holder_email: ckoHelper.getCustomer(args).email,
                billing_descriptor: businessName,
            },
        };

        return payObject;
    },

    /**
     * Klarna Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    klarnaPayAuthorization: function(args) {
        var form = app.getForm('klarnaForm');

        // Gdt the order
        var order = OrderMgr.getOrder(args.OrderNo, args.Order.orderToken);

        // Build the payment object
        var payObject = {
            amount: ckoHelper.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), ckoHelper.getCurrency(args)),
            currency: ckoHelper.getCurrency(args),
            capture: false,
            source: {
                type: 'klarna',
                authorization_token: form.get('klarna_token').value(), // eslint-disable-line
                locale: ckoHelper.getLanguage(),
                purchase_country: ckoHelper.getBillingObject(args).country,
                tax_amount: ckoHelper.getFormattedPrice(order.totalTax.value, ckoHelper.getCurrency(args)),
                billing_address: ckoHelper.getOrderBasketAddress(args),
                products: ckoHelper.getOrderBasketObject(args),
            },
        };
        form.clear();

        return payObject;
    },

    /**
     * Paypal Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    paypalPayAuthorization: function(args) {
        // Build the payment object
        var payObject = {
            currency: ckoHelper.getCurrency(args),
            source: {
                type: 'paypal',
                invoice_number: args.OrderNo,
            },
        };

        return payObject;
    },

    /**
     * Oxxo Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    oxxoPayAuthorization: function(args) {
        var form = app.getForm('oxxoForm');
        // Build the payment object
        var payObject = {
            source: {
                type: 'oxxo',
                integration_type: 'redirect',
                country: ckoHelper.getBillingObject(args).country,
                payer: {
                    name: ckoHelper.getCustomerName(args),
                    email: ckoHelper.getCustomer(args).email,
                    document: form.get('oxxo_identification').value()
                },
            },
            currency: ckoHelper.getCurrency(args),
        };
        form.clear();

        return payObject;
    },

    /**
     * Ali Pay Authorization.
     * @param {Object} args The payment arguments
     * @returns {Object} The payment parameters
     */
    aliPayAuthorization: function(args) {
        // Build the payment object
        var payObject = {
            source: {
                type: 'alipay',
            },
            currency: ckoHelper.getCurrency(args),
        };

        return payObject;
    },
};

// Module exports
module.exports = ckoApmConfig;
