'use strict';

var server = require('server');
server.extend(module.superModule);

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 *  Handle Ajax payment (and billing) form submit
 */
server.append('SubmitPayment', server.middleware.https, csrfProtection.validateAjaxRequest, function(req, res, next) {
    // eslint-disable-next-line no-shadow
    this.on('route:BeforeComplete', function(req, res) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        var currentBasket = BasketMgr.getCurrentBasket();
        var billingData = res.getViewData();
        if (currentBasket && currentBasket.billingAddress) {
            var billingAddress = currentBasket.billingAddress;
            Transaction.wrap(function() {
                if (billingData.storedPaymentUUID) {
                    billingAddress.setPhone(req.currentCustomer.profile.phone);
                } else if (billingData && billingData.phone) {
                    billingAddress.setPhone(billingData.phone.value);
                }
            });
        }
    });

    next();
});

server.prepend('PlaceOrder', server.middleware.https, function(req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var Transaction = require('dw/system/Transaction');
    var URLUtils = require('dw/web/URLUtils');
    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
    var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');

    var currentBasket = BasketMgr.getCurrentBasket();
    var deviceSessionId = req.form ? req.form.deviceSessionId : null;
    session.privacy.deviceSessionId = deviceSessionId;

    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString(),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    var validatedProducts = validationHelpers.validateProducts(currentBasket);
    if (validatedProducts.error) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString(),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    if (req.session.privacyCache.get('fraudDetectionStatus')) {
        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', '01').toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });

        this.emit('route:Complete', req, res);
        return;
    }

    var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', currentBasket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);
    if (validationOrderStatus.error) {
        res.json({
            error: true,
            errorMessage: validationOrderStatus.message,
        });
        this.emit('route:Complete', req, res);
        return;
    }

    // Check to make sure there is a shipping address
    if (currentBasket.defaultShipment.shippingAddress === null) {
        res.json({
            error: true,
            errorStage: {
                stage: 'shipping',
                step: 'address',
            },
            errorMessage: Resource.msg('error.no.shipping.address', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    // Check to make sure billing address exists
    if (!currentBasket.billingAddress) {
        res.json({
            error: true,
            errorStage: {
                stage: 'payment',
                step: 'billingAddress',
            },
            errorMessage: Resource.msg('error.no.billing.address', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    // Calculate the basket
    Transaction.wrap(function() {
        basketCalculationHelpers.calculateTotals(currentBasket);
    });

    // Re-validates existing payment instruments
    var validPayment = COHelpers.validatePayment(req, currentBasket);
    if (validPayment.error) {
        res.json({
            error: true,
            errorStage: {
                stage: 'payment',
                step: 'paymentInstrument',
            },
            errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    // Re-calculate the payments.
    var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
    if (calculatedPaymentTransactionTotal.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    // Creates a new order.
    var order = COHelpers.createOrder(currentBasket);
    if (!order) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    // Handles payment authorization
    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);

    if (handlePaymentResult.action) {
        try {
            res.json({
                action: true,
                error: false,
                order: {
                    orderNo: order.orderNo,
                    shippingAddress: {
                        firstName: order.defaultShipment.shippingAddress.firstName,
                        lastName: order.defaultShipment.shippingAddress.lastName,
                        city: order.defaultShipment.shippingAddress.city,
                        phone: order.defaultShipment.shippingAddress.phone,
                        countryCode: order.defaultShipment.shippingAddress.countryCode.value,
                        postalCode: order.defaultShipment.shippingAddress.postalCode,
                        address1: order.defaultShipment.shippingAddress.address1,
                    },
                    billingAddress: {
                        firstName: order.billingAddress.firstName,
                        lastName: order.billingAddress.lastName,
                        city: order.billingAddress.city,
                        phone: order.billingAddress.phone,
                        countryCode: order.billingAddress.countryCode.value,
                        postalCode: order.billingAddress.postalCode,
                        address1: order.billingAddress.address1,
                    },
                    customerEmail: order.customerEmail,
                    totalGrossPrice: order.totalGrossPrice.value,
                },
            });
            this.emit('route:Complete', req, res);
            return;
        } catch (error) {
            var Logger = require('dw/system/Logger').getLogger('ckoPayments');
            handlePaymentResult.error = true;
            Logger.error('Error While handling payments of the order: ' + order.orderNo + '. Error Details: ' + error.message);
        }
    }

    if (handlePaymentResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (fraudDetectionStatus.status === 'fail') {
        Transaction.wrap(function() { OrderMgr.failOrder(order, true); });

        // fraud detection failed
        req.session.privacyCache.set('fraudDetectionStatus', true);

        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });

        this.emit('route:Complete', req, res);
        return;
    }

    // 3DS and APMs Redirect
    if (handlePaymentResult.redirectUrl) {
        res.json({
            apm: true,
            error: false,
            continueUrl: handlePaymentResult.redirectUrl,
        });

        this.emit('route:Complete', req, res);
        return;
    }

    // Places the order
    var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
    if (placeOrderResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        this.emit('route:Complete', req, res);
        return;
    }

    if (req.currentCustomer.addressBook) {
        // save all used shipping addresses to address book of the logged in customer
        var allAddresses = addressHelpers.gatherShippingAddresses(order);
        allAddresses.forEach(function(address) {
            if (!addressHelpers.checkIfAddressStored(address, req.currentCustomer.addressBook.addresses)) {
                addressHelpers.saveAddress(address, req.currentCustomer, addressHelpers.generateAddressName(address));
            }
        });
    }

    if (order.getCustomerEmail()) {
        COHelpers.sendConfirmationEmail(order, req.locale.id);
    }

    // Reset usingMultiShip after successful Order placement
    req.session.privacyCache.set('usingMultiShipping', false);

    // TODO: Exposing a direct route to an Order, without at least encoding the orderID
    //  is a serious PII violation.  It enables looking up every customers orders, one at a
    //  time.
    res.json({
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString(),
    });

    this.emit('route:Complete', req, res);
    return;
});

module.exports = server.exports();
