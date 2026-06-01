'use strict';

var TaxMgr = require('dw/order/TaxMgr');

var base = module.superModule;
var isGrossPricing = TaxMgr.getTaxationPolicy() === TaxMgr.TAX_POLICY_GROSS;


/**
 * @constructor
 * @classdesc CartModel class that represents the current basket
 *
 * @param {dw.order.Basket} basket - Current users's basket
 */
function CartModel(basket) {
    base.call(this, basket);

    this.totalGrossPrice = '';
    this.totalTax = '';
    this.subTotal = '';

    if (basket && basket.totalGrossPrice && basket.totalGrossPrice.available) {
        this.totalGrossPrice = basket.totalGrossPrice.value;
    }

    if (basket && basket.totalTax && basket.totalTax.available) {
        this.totalTax = basket.totalTax.value;
    }

    if (basket && basket.getAdjustedMerchandizeTotalPrice(false) && basket.getAdjustedMerchandizeTotalPrice(false).available) {
        this.subTotal = basket.getAdjustedMerchandizeTotalPrice(false).value;
    }

    this.isGrossPricing = isGrossPricing;
}

CartModel.prototype = Object.create(base.prototype);
module.exports = CartModel;
