/* eslint-disable require-jsdoc */
/* eslint-disable no-undef */
'use strict';

var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');
var Transaction = require('dw/system/Transaction');
var PaymentProcessor = app.getModel('PaymentProcessor');
var BasketMgr = require('dw/order/BasketMgr');
var OrderMgr = require('dw/order/OrderMgr');
var URLUtils = require('dw/web/URLUtils');
var Response = require('*/cartridge/scripts/util/Response');
var HashMap = require('dw/util/HashMap');
var ShippingMgr = require('dw/order/ShippingMgr');

function handleShippingAddress(cart, shipData, shipMethod) {
    var shipForm = app.getForm('singleshipping');   // Here we are filling shipping form and store the value in the session for further use.
    var name = shipData.name.split(' ');
    shipForm.object.shippingAddress.addressFields.firstName.value = name[0];
    shipForm.object.shippingAddress.addressFields.lastName.value = name[1];
    shipForm.object.shippingAddress.addressFields.address1.value = shipData.address1;
    shipForm.object.shippingAddress.addressFields.address2.value = shipData.address2;
    shipForm.object.shippingAddress.addressFields.city.value = shipData.locality;
    shipForm.object.shippingAddress.addressFields.postal.value = shipData.postalCode;
    shipForm.object.shippingAddress.addressFields.phone.value = shipData.phoneNumber;
    shipForm.object.shippingAddress.addressFields.states.state.value = shipData.administrativeArea;
    shipForm.object.shippingAddress.addressFields.country.value = shipData.countryCode;
    shipForm.object.shippingAddress.addressFields.phone.value = shipData.phoneNumber;
    shipForm.object.shippingAddress.useAsBillingAddress.value = true;
}

function show() {
    var cart = app.getModel('Cart').get();
    var shipData = JSON.parse(request.httpParameterMap.shippingAddress.rawValue); // Seleced Shipping address comming from ajax
    var shippingMethod = JSON.parse(request.httpParameterMap.shippingMethod.stringValue);   // Seleced Shipping Method comming from ajax
    var ckoGooglePayData = request.httpParameterMap.ckoGooglePayData.stringValue; // Google payload data
    var emailAddress = request.httpParameterMap.email;
    handleShippingAddress(cart, shipData, shippingMethod);
    Transaction.wrap(function() {  // here we are wrapping the shipping address
        var defaultShipment,
            shippingAddress;
        defaultShipment = cart.getDefaultShipment();
        shippingAddress = cart.createShipmentShippingAddress(defaultShipment.getID());

        shippingAddress.setFirstName(session.forms.singleshipping.shippingAddress.addressFields.firstName.value);
        shippingAddress.setLastName(session.forms.singleshipping.shippingAddress.addressFields.lastName.value);
        shippingAddress.setAddress1(session.forms.singleshipping.shippingAddress.addressFields.address1.value);
        shippingAddress.setAddress2(session.forms.singleshipping.shippingAddress.addressFields.address2.value);
        shippingAddress.setCity(session.forms.singleshipping.shippingAddress.addressFields.city.value);
        shippingAddress.setPostalCode(session.forms.singleshipping.shippingAddress.addressFields.postal.value);
        shippingAddress.setStateCode(session.forms.singleshipping.shippingAddress.addressFields.states.state.value);
        shippingAddress.setCountryCode(session.forms.singleshipping.shippingAddress.addressFields.country.value);
        shippingAddress.setPhone(session.forms.singleshipping.shippingAddress.addressFields.phone.value);

        cart.updateShipmentShippingMethod(cart.getDefaultShipment().getID(), shippingMethod.id, null, null);
        cart.calculate();

        cart.validateForCheckout();
    });
    if (app.getForm('singleshipping').object.shippingAddress.useAsBillingAddress.value === true) { // billing form filling
        app.getForm('billing').object.billingAddress.addressFields.firstName.value = session.forms.singleshipping.shippingAddress.addressFields.firstName.value;
        app.getForm('billing').object.billingAddress.addressFields.lastName.value = session.forms.singleshipping.shippingAddress.addressFields.lastName.value;
        app.getForm('billing').object.billingAddress.addressFields.address1.value = session.forms.singleshipping.shippingAddress.addressFields.address1.value;
        app.getForm('billing').object.billingAddress.addressFields.address2.value = session.forms.singleshipping.shippingAddress.addressFields.address2.value;
        app.getForm('billing').object.billingAddress.addressFields.city.value = session.forms.singleshipping.shippingAddress.addressFields.city.value;
        app.getForm('billing').object.billingAddress.addressFields.postal.value = session.forms.singleshipping.shippingAddress.addressFields.postal.value;
        app.getForm('billing').object.billingAddress.addressFields.phone.value = session.forms.singleshipping.shippingAddress.addressFields.phone.value;
        app.getForm('billing').object.billingAddress.addressFields.states.state.value = session.forms.singleshipping.shippingAddress.addressFields.states.state.value;
        app.getForm('billing').object.billingAddress.addressFields.country.value = session.forms.singleshipping.shippingAddress.addressFields.country.value;
        app.getForm('billing').object.billingAddress.addressFields.phone.value = session.forms.singleshipping.shippingAddress.addressFields.phone.value;
        app.getForm('billing').object.paymentMethods.selectedPaymentMethodID.value = 'CHECKOUTCOM_GOOGLE_PAY';
        app.getForm('billing').object.fulfilled.value = true;
    }
    var billingAddress = cart.getBillingAddress();
    Transaction.wrap(function() { // wrapping the data of billing address
        if (!billingAddress) {
            billingAddress = cart.createBillingAddress();
        }

        app.getForm('billing.billingAddress.addressFields').copyTo(billingAddress);
        app.getForm('billing.billingAddress.addressFields.states').copyTo(billingAddress);

        cart.setCustomerEmail(emailAddress);  // this is email field, it should be dynamic.
    });
    Transaction.wrap(function() { // here we removing all the methods and add google pay method
        cart.removeExistingPaymentInstruments('CHECKOUTCOM_GOOGLE_PAY');
        var paymentInstrument = cart.createPaymentInstrument('CHECKOUTCOM_GOOGLE_PAY', cart.getNonGiftCertificateAmount());
        paymentInstrument.paymentTransaction.custom.ckoGooglePayData = ckoGooglePayData;
    });

    var bskt = BasketMgr.getCurrentBasket();
    var Order = app.getModel('Order'); // Ordermodel

    var order = OrderMgr.createOrder(bskt);
    var paymentInstrument = order.paymentInstrument;
    var authorizationResult = PaymentProcessor.authorize(order, paymentInstrument);

    if (authorizationResult.not_supported || authorizationResult.error) {
        Response.renderJSON({
            error: true,
        });
        return;
    } else if (authorizationResult.redirectURL) {
        Response.renderJSON({
            success: true,
            url: authorizationResult.redirectURL,
        });
        return;
    }

    var orderPlacementStatus = Order.submit(order); // submitting the order.

    if (orderPlacementStatus.order_created) {
        if (!orderPlacementStatus.Order.customer.authenticated) {
            // Initializes the account creation form for guest checkouts by populating the first and last name with the
            // used billing address.
            var customerForm = app.getForm('profile.customer');
            customerForm.setValue('firstname', order.billingAddress.firstName);
            customerForm.setValue('lastname', order.billingAddress.lastName);
            customerForm.setValue('email', order.customerEmail);
            customerForm.setValue('orderNo', order.orderNo);
            customerForm.setValue('orderUUID', order.getUUID());
        }

        app.getForm('profile.login.passwordconfirm').clear();
        app.getForm('profile.login.password').clear();
    }

    var protocol = request.httpProtocol;
    var hostName = request.httpHost;
    var origin = '' + protocol + '://' + hostName;
    var url = origin + URLUtils.url('PDPGooglePay-RedirectRoute').toString();

    Response.renderJSON({
        success: true,
        url: url,
        order: orderPlacementStatus.Order.orderNo,
    });
}

function redirectRoute(orderNo) {
    var order = OrderMgr.getOrder(request.httpQueryString);
    if (!order.customer.authenticated) {
        // Initializes the account creation form for guest checkouts by populating the first and last name with the
        // used billing address.
        var customerForm = app.getForm('profile.customer');
        customerForm.setValue('firstname', order.billingAddress.firstName);
        customerForm.setValue('lastname', order.billingAddress.lastName);
        customerForm.setValue('email', order.customerEmail);
        customerForm.setValue('orderNo', order.orderNo);
        customerForm.setValue('orderUUID', order.getUUID());
    }

    app.getForm('profile.login.passwordconfirm').clear();
    app.getForm('profile.login.password').clear();
    app.getView({
        Order: order,
        ContinueURL: URLUtils.https('Account-RegistrationForm'), // needed by registration form after anonymous checkouts
    }).render('checkout/confirmation/confirmation');
}

function shippingMethodFetch() {
    var i,
        applicableShippingMethods,
        shippingCosts,
        method;

    var cart = app.getModel('Cart').get();

    var productDiscountTotal = 0;
    var productLineItems = cart.getProductLineItems();
    for (var index = 0; index < productLineItems.length; index++) {
        var productLineItem = productLineItems[index];
        var priceAdjustments = productLineItem.getPriceAdjustments();
        for (var j = 0; j < priceAdjustments.length; j++) {
            var priceAdjustment = priceAdjustments[j];
            // eslint-disable-next-line operator-assignment
            productDiscountTotal = productDiscountTotal + priceAdjustment.priceValue;
        }
    }

    var shippingAddress;
    var address = JSON.parse(request.httpParameterMap.address.rawValue) ? JSON.parse(request.httpParameterMap.address.rawValue) : {};

    var defaultSelectedShippingMethod = ShippingMgr.getDefaultShippingMethod();
    var defaultSelectedShippingMethodId = defaultSelectedShippingMethod.ID;

    var shipAddress;
    if (address) {
        shipAddress = {
            firstName: address.firstName,
            lastName: address.lastName,
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            stateCode: address.stateCode,
            postalCode: address.postalCode,
            countryCode: address.countryCode,
            phone: address.phone,
        };

        Transaction.wrap(function() { // here we are wrapping the shipping address
            var defaultShipment;
            defaultShipment = cart.getDefaultShipment();
            shippingAddress = cart.createShipmentShippingAddress(defaultShipment.getID());

            shippingAddress.setFirstName(address.firstName);
            shippingAddress.setLastName(address.lastName);
            shippingAddress.setAddress1(address.address1);
            shippingAddress.setAddress2(address.address2);
            shippingAddress.setCity(address.city);
            shippingAddress.setPostalCode(address.postalCode);
            shippingAddress.setStateCode(address.stateCode);
            shippingAddress.setCountryCode(address.countryCode);
            shippingAddress.setPhone(address.phone);
        });
    }

    applicableShippingMethods = cart.getApplicableShippingMethods(shipAddress);
    var shippingMethods = [];
    var shipCosts = {};
    var salesTax = {};
    var discounts = {};
    shippingCosts = new HashMap();

    // Transaction controls are for fine tuning the performance of the data base interactions when calculating shipping methods
    Transaction.begin();

    for (i = 0; i < applicableShippingMethods.length; i++) {
        if (!applicableShippingMethods[i].custom.storePickupEnabled) {
            var shippingMethod = {
                id: applicableShippingMethods[i].ID,
                label: applicableShippingMethods[i].displayName,
                description: applicableShippingMethods[i].description,
            };
            shippingMethods.push(shippingMethod);
            method = applicableShippingMethods[i];

            cart.updateShipmentShippingMethod(cart.getDefaultShipment().getID(), method.getID(), method, applicableShippingMethods);
            cart.calculate();
            shippingCosts.put(method.getID(), cart.preCalculateShipping(method));

            var shippingCost = cart.preCalculateShipping(method);
            shipCosts[applicableShippingMethods[i].ID] = shippingCost.shippingExclDiscounts.value.toString();
            salesTax[applicableShippingMethods[i].ID] = cart.object.totalTax.value.toString();

            var shippingExclDiscounts = cart.object.shippingTotalPrice;
            var shippingInclDiscounts = cart.object.getAdjustedShippingTotalPrice();
            var shippingDiscount = shippingExclDiscounts.subtract(shippingInclDiscounts);

            var merchTotalExclOrderDiscounts = cart.object.getAdjustedMerchandizeTotalPrice(false);
            var merchTotalInclOrderDiscounts = cart.object.getAdjustedMerchandizeTotalPrice(true);
            var orderDiscount = merchTotalExclOrderDiscounts.subtract(merchTotalInclOrderDiscounts);
            var totalDiscounts = orderDiscount + shippingDiscount;

            discounts[applicableShippingMethods[i].ID] = totalDiscounts.toString();
        }
    }

    Transaction.rollback();

    Response.renderJSON({
        success: true,
        shipMethods: shippingMethods,
        shipCosts: shipCosts,
        salesTax: salesTax,
        discounts: discounts,
        productDiscountTotal: productDiscountTotal,
        defaultShippingMethod: defaultSelectedShippingMethodId,
    });
}


function createBasketForPDP() {
    var cart = app.getModel('Cart').goc();

    if (cart) {
        Transaction.wrap(function() {
            var productLineItems = cart.getAllProductLineItems().iterator();
            while (productLineItems.hasNext()) {
                var productLineItem = productLineItems.next();
                cart.removeProductLineItem(productLineItem);
            }
        });
    }

    // eslint-disable-next-line no-unused-vars
    var newBonusDiscountLineItem;
    var Product = app.getModel('Product');
    var productToAdd;

    var previousBonusDiscountLineItems = cart.getBonusDiscountLineItems();
    productToAdd = Product.get(request.httpParameterMap.productID.stringValue);

    cart.addProductItem(productToAdd.object, 1, null);

    // When adding a new product to the cart, check to see if it has triggered a new bonus discount line item.
    newBonusDiscountLineItem = cart.getNewBonusDiscountLineItem(previousBonusDiscountLineItems);
}

exports.ShippingMethodFetch = guard.ensure(['get', 'https'], shippingMethodFetch);
exports.RedirectRoute = guard.ensure(['get', 'https'], redirectRoute);
exports.Show = guard.ensure(['post', 'https'], show);
exports.CreateBasketForPDP = guard.ensure(['post', 'https'], createBasketForPDP);
