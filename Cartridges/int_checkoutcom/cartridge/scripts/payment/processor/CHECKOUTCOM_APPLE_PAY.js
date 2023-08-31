'use strict';

var Status = require('dw/system/Status');
var applePayHelper = require('*/cartridge/scripts/helpers/applePayHelper');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var Transaction = require('dw/system/Transaction');
var PaymentMgr = require('dw/order/PaymentMgr');
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

exports.authorizeOrderPayment = function(order, event) {
    var isEventTrusted = Object.prototype.hasOwnProperty.call(event, 'isTrusted')
    && event.isTrusted === true
    && order;
    /* eslint-disable no-param-reassign */
    order.custom.orderProcessedByABCorNAS = ckoHelper.getAbcOrNasEnabled();

    if (isEventTrusted) {
        // Payment request
        var result = applePayHelper.handleRequest(
            event.payment.token.paymentData,
            'CHECKOUTCOM_APPLE_PAY',
            order.orderNo
        );

        Transaction.wrap(function() {
            order.removeAllPaymentInstruments();
            var paymentInstrument = order.createPaymentInstrument('CHECKOUTCOM_APPLE_PAY', order.getTotalGrossPrice());

            var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
            paymentInstrument.paymentTransaction.setTransactionID(result.gatewayResponse.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        });

        if (result.error) {
            return new Status(Status.ERROR);
        }

        return new Status(Status.OK);
    }

    return new Status(Status.ERROR);
};

exports.placeOrder = function(order) {
    // Get Previews Notes and Remove them
    var orderNotes = order.getNotes();

    // Remove sfcc notes
    if (orderNotes.length > 0) {
        for (var i = 0; i < orderNotes.length; i++) {
            var currentNote = orderNotes.get(i);
            var subject = currentNote.subject;
            if (subject === 'Payment Authorization Warning!') {
                order.removeNote(currentNote);
            }
        }
    }

    // Get Previews Notes and Remove them
    orderNotes = order.getNotes();

    var placeOrderStatus = OrderMgr.placeOrder(order);
    if (placeOrderStatus === Status.ERROR) {
        OrderMgr.failOrder(order);
        throw new Error('Failed to place order.');
    }
    order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
    order.setExportStatus(Order.EXPORT_STATUS_READY);
};

exports.shippingContactSelected = function(basket, event, response) {
    var app = require('*/cartridge/scripts/app');
    var ShippingMgr = require('dw/order/ShippingMgr');

    if (basket.shipments && basket.shipments[0]) {
        var shippingModel = ShippingMgr.getShipmentShippingModel(basket.shipments[0]);
        var applicableShippingMethods = shippingModel.getApplicableShippingMethods();
        var filteredShippingMethods = [];

        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (var key in applicableShippingMethods) {
            var applicableShippingMethod = applicableShippingMethods[key];
            var cost = shippingModel.getShippingCost(applicableShippingMethod).getAmount();

            if (applicableShippingMethod.ID) {
                if (!applicableShippingMethod.custom.storePickupEnabled) {
                    var filteredShippingMethod = {
                        identifier: applicableShippingMethod.ID,
                        amount: cost.value,
                        label: applicableShippingMethod.displayName,
                        detail: applicableShippingMethod.description,
                    };
                    filteredShippingMethods.push(filteredShippingMethod);
                }
            }
        }

        var productLineItemTotal = response.lineItems[0];

        basket.shipments[0].setShippingMethod(applicableShippingMethods[0]);

        var cart = app.getModel('Cart').get();
        cart.calculate(basket);

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

        var shippingExclDiscounts = basket.shippingTotalPrice;
        var shippingInclDiscounts = basket.getAdjustedShippingTotalPrice();
        var shippingDiscount = shippingExclDiscounts.subtract(shippingInclDiscounts);

        var merchTotalExclOrderDiscounts = basket.getAdjustedMerchandizeTotalPrice(false);
        var merchTotalInclOrderDiscounts = basket.getAdjustedMerchandizeTotalPrice(true);
        var orderDiscount = merchTotalExclOrderDiscounts.subtract(merchTotalInclOrderDiscounts);
        var totalDiscounts = orderDiscount + shippingDiscount + (productDiscountTotal * -1);

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

        if (totalDiscounts > 0) {
            var discount = {
                amount: '-' + totalDiscounts.toString(),
                label: 'Discounts',
                type: 'final',
            };
            applePayLineItems.push(discount);
        }

        response.shippingMethods = filteredShippingMethods;
        response.lineItems = applePayLineItems;
        response.total.amount = basket.totalGrossPrice.value;
    }

    return;
};

exports.getRequest = function(basket, req) {
    var currentLocale = ckoHelper.getSiteCurrentCountryCode();
    if(currentLocale === 'SA') {
        req.supportedNetworks.push('mada');
    }
    session.custom.applepaysession = 'yes'; 
};