'use strict';
var server = require('server');

var OrderMgr = require('dw/order/OrderMgr');
var OrderModel = require('*/cartridge/models/order');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var Resource = require('dw/web/Resource');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var orderGuard = require('*/cartridge/scripts/helpers/orderGuard');

server.post('Submit', csrfProtection.generateToken, function(req, res, next) {
    var order = OrderMgr.getOrder(req.querystring.order_id);

    // Missing order, or a token that is not the order's: refused
    if (!order || req.querystring.order_token !== order.getOrderToken()) {
        return next(new Error('Order token does not match'));
    }

    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', order, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (fraudDetectionStatus.status === 'fail') {
        orderGuard.reverseStrayPayments(order.orderNo);
        orderGuard.failOrder(order);

        // fraud detection failed
        req.session.privacyCache.set('fraudDetectionStatus', true);
        var fraudError = Resource.msg('error.technical', 'checkout', null);
        return next(new Error(fraudError));
    }
    // Once: a concurrent request placing it first is a success
    var orderPlacementStatus = orderGuard.placeOrder(order, fraudDetectionStatus);

    if (orderPlacementStatus.error) {
        orderGuard.reverseStrayPayments(order.orderNo);
        orderGuard.failOrder(order);

        return next(new Error('Could not place order'));
    }

    var config = {
        numberOfLineItems: '*',
    };
    var orderModel = new OrderModel(order, { config: config });
    if (!req.currentCustomer.profile) {
        var passwordForm = server.forms.getForm('newPasswords');
        passwordForm.clear();
        res.render('checkout/confirmation/confirmation', {
            order: orderModel,
            returningCustomer: false,
            passwordForm: passwordForm,
        });
    } else {
        res.render('checkout/confirmation/confirmation', {
            order: orderModel,
            returningCustomer: true,
        });
    }
    return next();
});

module.exports = server.exports();
