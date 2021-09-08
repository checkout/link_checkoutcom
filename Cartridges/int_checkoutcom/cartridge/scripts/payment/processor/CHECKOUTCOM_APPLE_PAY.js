'use strict';

var Status = require('dw/system/Status');
var applePayHelper = require('~/cartridge/scripts/helpers/applePayHelper');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
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

        if (!result) {
            return new Status(Status.ERROR);
        }

        return new Status(Status.OK);
    }

    return new Status(Status.ERROR);
};

exports.placeOrder = function(order) {
    var paymentInstruments = order.getPaymentInstruments('CHECKOUTCOM_APPLE_PAY').toArray();

    var paymentInstrument = paymentInstruments[0];
    var paymentTransaction = paymentInstrument.getPaymentTransaction();
    paymentTransaction.setTransactionID('#');

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
