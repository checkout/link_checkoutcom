'use strict';

// Checkout.com amount formats: full value, times 1000, else times 100 (CLP
// included, which ISO 4217 lists without decimals):
// https://www.checkout.com/docs/payments/accept-payments/format-the-amount-value
var ckoCurrencyConfig = {
    x1: {
        currencies: 'BIF DJF GNF ISK JPY KMF KRW PYG RWF UGX VUV VND XAF XOF XPF',
        multiple: '1',
    },

    x1000: {
        currencies: 'BHD IQD JOD KWD LYD OMR TND',
        multiple: '1000',
    },
};

// Module exports
module.exports = ckoCurrencyConfig;
