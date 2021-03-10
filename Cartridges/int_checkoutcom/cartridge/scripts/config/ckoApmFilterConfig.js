'use strict';

var ckoApmFilterConfig = {
    ideal: {
        countries: ['NL'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoIdealEnabled'),
    },
    boleto: {
        countries: ['BR'],
        currencies: ['BRL', 'USD'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoBoletoEnabled'),
    },
    bancontact: {
        countries: ['BE'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoBancontactEnabled'),
    },
    benefit: {
        countries: ['BH'],
        currencies: ['BHD'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoBenefitEnabled'),
    },
    giro: {
        countries: ['DE'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoGiroEnabled'),
    },
    eps: {
        countries: ['AT'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoEpsEnabled'),
    },
    sofort: {
        countries: ['AT', 'BE', 'DE', 'ES', 'IT', 'NL'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoSofortEnabled'),
    },
    knet: {
        countries: ['KW'],
        currencies: ['KWD'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoKnetEnabled'),
    },
    qpay: {
        countries: ['QA'],
        currencies: ['QAR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoQpayEnabled'),
    },
    fawry: {
        countries: ['EG'],
        currencies: ['EGP'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoFawryEnabled'),
    },
    multibanco: {
        countries: ['PT'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoMultibancoEnabled'),
    },
    poli: {
        countries: ['AU', 'NZ'],
        currencies: ['AUD', 'NZD'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoPoliEnabled'),
    },
    sepa: {
        countries: ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK', 'AD', 'BG', 'CH', 'CZ', 'DK', 'GB', 'HR', 'HU', 'IS', 'LI', 'MC', 'NO', 'PL', 'RO', 'SM', 'SE', 'VA'],
        currencies: ['EUR'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoSepaEnabled'),
    },
    p24: {
        countries: ['PL'],
        currencies: ['EUR', 'PLN'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoP24Enabled'),
    },
    klarna: {
        countries: ['AT', 'DK', 'FI', 'DE', 'NL', 'NO', 'SE', 'UK', 'GB'],
        currencies: ['EUR', 'DKK', 'GBP', 'NOK', 'SEK'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoKlarnaEnabled'),
    },
    oxxo: {
        countries: ['MX'],
        currencies: ['MXN'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoOxxoEnabled'),
    },
    alipay: {
        countries: ['CN'],
        currencies: ['USD', 'CNY'], // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoAlipayEnabled'),
    },
    paypal: {
        countries: ['*'],
        currencies: ['AUD', 'BRL', 'CAD', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'INR', 'ILS', 'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB', 'SGD', 'SEK', 'CHF', 'THB', 'USD'],
        // eslint-disable-next-line
        enabled: dw.system.Site.getCurrent().getCustomPreferenceValue('ckoPaypalEnabled'),
    },
};


// Module exports
module.exports = ckoApmFilterConfig;
