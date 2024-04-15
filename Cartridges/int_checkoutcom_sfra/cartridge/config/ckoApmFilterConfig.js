'use strict';

var currentSite = require('dw/system/Site').getCurrent();

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/*
 * APM filters config.
 */
var ckoApmFilterConfig = {
    ideal: {
        countries: ['NL'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_IDEAL_ENABLED),
    },
    /* Boleto has been temporarily removed from the business manager configuration, rendering this payment method currently inactive.
    *  To activate it, include the metadata in the business manager for 'CKO [5] APM Settings' custom preference.
    *  Ticket no. CHECBLD-149
    */
    /*
    boleto: {
        countries: ['BR'],
        currencies: ['BRL', 'USD'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_BOLETO_ENABLED),
    },
    */
    bancontact: {
        countries: ['BE'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_BANCONTACT_ENABLED),
    },
    /* Benefitpay has been temporarily removed from the business manager configuration, rendering this payment method currently inactive.
    *  To activate it, include the metadata in the business manager for 'CKO [5] APM Settings' custom preference.
    *  Ticket no. CHECBLD-149
    */
    /*
    benefitpay: {
        countries: ['BH'],
        currencies: ['BHD'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_BENEFIT_ENABLED),
    },
    */
    giropay: {
        countries: ['DE'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_GIRO_ENABLED),
    },
    eps: {
        countries: ['AT'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_EPS_ENABLED),
    },
    sofort: {
        countries: ['AT', 'BE', 'DE', 'ES', 'IT', 'NL'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_SOFORT_ENABLED),
    },
    knet: {
        countries: ['KW'],
        currencies: ['KWD'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_KNET_ENABLED),
    },
    qpay: {
        countries: ['QA'],
        currencies: ['QAR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_QPAY_ENABLED),
    },
    fawry: {
        countries: ['EG'],
        currencies: ['EGP'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_FAWRY_ENABLED),
    },
    multibanco: {
        countries: ['PT'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_MULTIBANCO_ENABLED),
    },
    /* Poli has been temporarily removed from the business manager configuration, rendering this payment method currently inactive.
    *  To activate it, include the metadata in the business manager for 'CKO [5] APM Settings' custom preference.
    *  Ticket no. CHECBLD-149
    */
    /*
    poli: {
        countries: ['AU', 'NZ'],
        currencies: ['AUD', 'NZD'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_POLI_ENABLED),
    },
    */
    sepa: {
        countries: ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK', 'AD', 'BG', 'CH', 'CZ', 'DK', 'GB', 'HR', 'HU', 'IS', 'LI', 'MC', 'NO', 'PL', 'RO', 'SM', 'SE', 'VA'],
        currencies: ['EUR'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_SEPA_ENABLED),
    },
    p24: {
        countries: ['PL'],
        currencies: ['EUR', 'PLN'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_P24_ENABLED),
    },
    klarna: {
        countries: ['AT', 'DK', 'FI', 'DE', 'NL', 'NO', 'SE', 'UK', 'GB'],
        currencies: ['EUR', 'DKK', 'GBP', 'NOK', 'SEK'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_KLARNA_ENABLED),
    },
    /* Alipay has been temporarily removed from the business manager configuration, rendering this payment method currently inactive.
    *  To activate it, include the metadata in the business manager for 'CKO [5] APM Settings' custom preference.
    *  Ticket no. CHECBLD-149
    */
    /*
    alipay: {
        countries: ['CN', 'US'],
        currencies: ['USD', 'CNY'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_ALIPAY_ENABLED),
    },
    */
    paypal: {
        countries: ['*'],
        currencies: ['AUD', 'BRL', 'CAD', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'INR', 'ILS', 'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB', 'SGD', 'SEK', 'CHF', 'THB', 'USD'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_PAYPAL_ENABLED),
    },
    /* OXXO has been temporarily removed from the business manager configuration, rendering this payment method currently inactive.
    *  To activate it, include the metadata in the business manager for 'CKO [5] APM Settings' custom preference.
    *  Ticket no. CHECBLD-149
    */
    /*
    oxxo: {
        countries: ['MX'],
        currencies: ['MXN'],
        enabled: currentSite.getCurrent().getCustomPreferenceValue(constants.CKO_OXXO_ENABLED),
    },
    */
};

/*
* Module exports
*/

module.exports = ckoApmFilterConfig;
