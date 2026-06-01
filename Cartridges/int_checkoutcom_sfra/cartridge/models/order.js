'use strict';

var base = module.superModule;

/**
 * Order class that represents the current order
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current users's basket/order
 * @param {Object} options - The current order's line items
 * @constructor
 */
function OrderModel(lineItemContainer, options) {
    base.call(this, lineItemContainer, options);

    this.totalGrossPrice = '';

    if (lineItemContainer && lineItemContainer.totalGrossPrice && lineItemContainer.totalGrossPrice.available) {
        this.totalGrossPrice = lineItemContainer.totalGrossPrice.value;
    }
}

OrderModel.prototype = Object.create(base.prototype);
module.exports = OrderModel;
