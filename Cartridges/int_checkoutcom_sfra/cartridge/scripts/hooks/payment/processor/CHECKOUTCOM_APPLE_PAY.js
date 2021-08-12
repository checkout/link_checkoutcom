'use strict';

var Status = require('dw/system/Status');

/** Utility **/
var applePayHelper = require('~/cartridge/scripts/helpers/applePayHelper');
var Transaction = require('dw/system/Transaction');

exports.authorizeOrderPayment = function(order, event) {
    var condition = Object.prototype.hasOwnProperty.call(event, 'isTrusted')
    && event.isTrusted === true
    && order;

    if (condition) {
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
    session.custom.applepaysession = 'yes';  // eslint-disable-line
};
