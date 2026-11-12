'use strict';

var TaxMgr = require('dw/order/TaxMgr');

var base = module.superModule;
var baseShowProductPage = base.showProductPage;

base.showProductPage = function(querystring, reqPageMetaData) {
    var productPageResult = baseShowProductPage.call(this, querystring, reqPageMetaData);
    productPageResult.product.isGrossPricing = TaxMgr.getTaxationPolicy() === TaxMgr.TAX_POLICY_GROSS;
    return productPageResult;
};

module.exports = base;
