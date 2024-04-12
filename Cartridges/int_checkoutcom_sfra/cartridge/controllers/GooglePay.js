/* eslint-disable no-unused-vars */
'use strict';

var server = require('server');

var OrderMgr = require('dw/order/OrderMgr');
var Locale = require('dw/util/Locale');
var OrderModel = require('*/cartridge/models/order');
var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var BasketMgr = require('dw/order/BasketMgr');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var cartHelper = require('*/cartridge/scripts/cart/cartHelpers');
var CartModel = require('*/cartridge/models/cart');
var Transaction = require('dw/system/Transaction');
var PaymentManager = require('dw/order/PaymentMgr');
var HookMgr = require('dw/system/HookMgr');
var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');

// eslint-disable-next-line require-jsdoc
function setPaymentData(req, ckoGooglePayData, shippingAddress, emailAddress) {
    var currentBasket = BasketMgr.getCurrentOrNewBasket();

    var viewData = {};
    var paymentForm = {
        googlePayForm: {
            ckoGooglePayData: {
                htmlValue: ckoGooglePayData,
            },
        },
        paymentMethod: {
            htmlValue: 'CHECKOUTCOM_GOOGLE_PAY',
        },
    };

    var name = shippingAddress.name.split(' ');
    viewData.address = {
        firstName: { value: name[0] },
        lastName: { value: name[1] },
        address1: { value: shippingAddress.address1 },
        address2: { value: shippingAddress.address2 },
        city: { value: shippingAddress.locality },
        postalCode: { value: shippingAddress.postalCode },
        countryCode: { value: shippingAddress.countryCode },
        phone: { value: shippingAddress.phoneNumber },
        stateCode: { value: shippingAddress.administrativeArea },
    };

    var billingAddress = currentBasket.billingAddress;
    Transaction.wrap(function() {
        if (!billingAddress) {
            billingAddress = currentBasket.createBillingAddress();
        }

        billingAddress.setFirstName(name[0]);
        billingAddress.setLastName(name[1]);
        billingAddress.setAddress1(shippingAddress.address1);
        billingAddress.setAddress2(shippingAddress.address2);
        billingAddress.setCity(shippingAddress.locality);
        billingAddress.setPostalCode(shippingAddress.postalCode);
        billingAddress.setStateCode(shippingAddress.administrativeArea);
        billingAddress.setCountryCode(shippingAddress.countryCode);
        billingAddress.setPhone(shippingAddress.phoneNumber);

        currentBasket.customerEmail = emailAddress;
    });


    var paymentMethodIdValue = 'CHECKOUTCOM_GOOGLE_PAY';
    if (!PaymentManager.getPaymentMethod(paymentMethodIdValue).paymentProcessor) {
        throw new Error(Resource.msg(
            'error.payment.processor.missing',
            'checkout',
            null
        ));
    }

    var paymentProcessor = PaymentManager.getPaymentMethod(paymentMethodIdValue).getPaymentProcessor();

    var paymentFormResult;
    if (HookMgr.hasHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase())) {
        paymentFormResult = HookMgr.callHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase(),
            'processForm',
            {},
            paymentForm,
            viewData
        );
    } else {
        paymentFormResult = HookMgr.callHook('app.payment.form.processor.default_form_processor', 'processForm');
    }

    var hookResult;
    if (HookMgr.hasHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase())) {
        hookResult = HookMgr.callHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
            'Handle',
            currentBasket,
            paymentFormResult.viewData.paymentInformation,
            paymentMethodIdValue,
            req
        );
    } else {
        hookResult = HookMgr.callHook('app.payment.processor.default', 'Handle');
    }


    if (HookMgr.hasHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase())) {
        HookMgr.callHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase(),
            'savePaymentInformation',
            req,
            currentBasket,
            paymentFormResult.viewData
        );
    } else {
        HookMgr.callHook('app.payment.form.processor.default', 'savePaymentInformation');
    }

    // Calculate the basket
    Transaction.wrap(function() {
        basketCalculationHelpers.calculateTotals(currentBasket);
    });

    // Re-calculate the payments.
    var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
        currentBasket
    );

    var order = COHelpers.createOrder(currentBasket);
    return order;
}

server.post('ExpressCheckout', function(req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var result = {};

    var shippingAddress = JSON.parse(req.form.shippingAddress);
    var ckoGooglePayData = req.form.ckoGooglePayData;
    var shippingMethod = JSON.parse(req.form.shippingMethod);
    var emailAddress = req.form.email;

    if (!shippingAddress || !shippingMethod) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        return next();
    }

    var name = shippingAddress.name.split(' ');
    result.address = {
        firstName: name[0],
        lastName: name[1],
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        city: shippingAddress.locality,
        postalCode: shippingAddress.postalCode,
        countryCode: shippingAddress.countryCode,
        phone: shippingAddress.phoneNumber,
        stateCode: shippingAddress.administrativeArea,
    };

    result.shippingBillingSame =
                true;

    result.shippingMethod = shippingMethod.id;

    COHelpers.copyShippingAddressToShipment(
        result,
        currentBasket.defaultShipment
    );

    COHelpers.recalculateBasket(currentBasket);

    if (!ckoGooglePayData) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        return next();
    }

    var order = setPaymentData(req, ckoGooglePayData, shippingAddress, emailAddress);

    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);

    if (handlePaymentResult.error === true) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        return next();
    } else if (handlePaymentResult.redirectUrl) {
        res.json({
            success: true,
            redirectUrl: handlePaymentResult.redirectUrl,
        });
        return next();
    }

    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);

    if (order.getCustomerEmail()) {
        COHelpers.sendConfirmationEmail(order, req.locale.id);
    }

    var Order = OrderMgr.getOrder(order.orderNo, order.orderToken);

    var config = {
        numberOfLineItems: '*',
    };

    var currentLocale = Locale.getLocale(req.locale.id);

    var orderModel = new OrderModel(
        Order,
        { config: config, countryCode: currentLocale.country, containerView: 'order' }
    );

    var reportingURLs = reportingUrlsHelper.getOrderReportingURLs(Order);

    res.render('checkout/confirmation/confirmation', {
        order: orderModel,
        returningCustomer: true,
        reportingURLs: reportingURLs,
        orderUUID: order.getUUID(),
    });

    return next();
});

module.exports = server.exports();
