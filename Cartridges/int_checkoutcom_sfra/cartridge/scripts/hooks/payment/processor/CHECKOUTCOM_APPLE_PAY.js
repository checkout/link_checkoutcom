'use strict';

var Status = require('dw/system/Status');

/** Utility **/
var applePayHelper = require('*/cartridge/scripts/helpers/applePayHelper');
var Transaction = require('dw/system/Transaction');
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

exports.authorizeOrderPayment = function(order, event) {
    var isEventTrusted = Object.prototype.hasOwnProperty.call(event, 'isTrusted')
    && event.isTrusted === true
    && order;
    /* eslint-disable no-param-reassign */
    order.custom.orderProcessedByABCorNAS = ckoHelper.getNasEnabled();

    if (isEventTrusted) {
        // Payment request
        var result = applePayHelper.handleRequest(
            event.payment.token.paymentData,
            'CHECKOUTCOM_APPLE_PAY',
            order.orderNo
        );

        Transaction.wrap(function() {
            order.removeAllPaymentInstruments();
            order.createPaymentInstrument('CHECKOUTCOM_APPLE_PAY', order.getTotalGrossPrice());
        });

        if (!result.error) {
            return new Status(Status.OK);
        }
    }

    return new Status(Status.ERROR);
};

exports.getRequest = function(basket, req) {
    var currentLocale = ckoHelper.getSiteCurrentCountryCode();
    if(currentLocale === 'SA') {
        req.supportedNetworks.push('mada');
    }
    session.custom.applepaysession = 'yes';  // eslint-disable-line
};

exports.shippingContactSelected = function(basket, event, response) {
    var ShippingHelpers = require('*/cartridge/scripts/checkout/shippingHelpers');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var TotalsModel = require('*/cartridge/models/totals');
    // eslint-disable-next-line no-useless-escape
    var formatMoneyReg = /\d*\.?\d+|\d*\,?\d/g;

    if (basket.shipments && basket.shipments[0]) {
        var applicableShippingMethods = ShippingHelpers.getApplicableShippingMethods(basket.shipments[0], null, basket);
        var filteredShippingMethods = [];

        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (var key in applicableShippingMethods) {
            var applicableShippingMethod = applicableShippingMethods[key];
            var cost = applicableShippingMethod.shippingCost.match(formatMoneyReg) ? applicableShippingMethod.shippingCost.match(formatMoneyReg).join('') : '0.00';

            if (applicableShippingMethod.ID) {
                var filteredShippingMethod = {
                    identifier: applicableShippingMethod.ID,
                    amount: cost,
                    label: applicableShippingMethod.displayName,
                    detail: applicableShippingMethod.description,
                };
                filteredShippingMethods.push(filteredShippingMethod);
            }
        }

        var productLineItemTotal = response.lineItems[0];

        ShippingHelpers.selectShippingMethod(basket.shipments[0], applicableShippingMethods[0].ID);

        COHelpers.recalculateBasket(basket);

        var productDiscountTotal = 0;
        var productLineItems = basket.getProductLineItems();
        for (var index = 0; index < productLineItems.length; index++) {
            var productLineItem = productLineItems[index];
            var priceAdjustments = productLineItem.getPriceAdjustments();
            for (var i = 0; i < priceAdjustments.length; i++) {
                var priceAdjustment = priceAdjustments[i];
                // eslint-disable-next-line operator-assignment
                productDiscountTotal = productDiscountTotal + priceAdjustment.priceValue;
            }
        }

        var totalsModel = new TotalsModel(basket);
        var discounts = totalsModel.shippingLevelDiscountTotal.value + totalsModel.orderLevelDiscountTotal.value + (productDiscountTotal * -1);

        var applePayLineItems = [
            productLineItemTotal,
            {
                amount: basket.shippingTotalPrice.value,
                label: basket.shipments[0].shippingMethod.displayName,
                type: 'final',
            },
            {
                amount: basket.totalTax.value,
                label: 'Tax',
                type: 'final',
            },
        ];

        if (discounts > 0) {
            var discount = {
                amount: '-' + discounts.toString(),
                label: 'Discounts',
                type: 'final',
            };
            applePayLineItems.push(discount);
        }

        response.shippingMethods = filteredShippingMethods;
        response.lineItems = applePayLineItems;
        // eslint-disable-next-line no-useless-escape
        response.total.amount = totalsModel.grandTotal.replace(/[^\d\.\,\s]+/g, '');
    }

    return;
};
