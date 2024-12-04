/* eslint-disable no-undef */

'use strict';

var server = require('server');
var BasketMgr = require('dw/order/BasketMgr');
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var constants = require('*/cartridge/config/constants');
var payPalHelper = require('*/cartridge/scripts/helpers/payPalHelper');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');

/**
 * Set request data for PayPal context service
 * @param {Object} basket - The basket object containing order details
 * @param {string} shippingPreference - Shipping Preference get from files or set provided address
 * @returns {Object} requestData - The formatted request data for PayPal
 */
function setRequestData(basket, shippingPreference) {
    var amountToBePaid = basket.totalGrossPrice.value;
    var shippingAddress = basket.shipments[0].shippingAddress;
    var shippingCost = basket.adjustedShippingTotalGrossPrice.value;
    var items = (basket.allProductLineItems).toArray();
    var processingChannelId = Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId');

    var requestData = {
        source: {
            type: 'paypal',
        },
        currency: session.getCurrency().getCurrencyCode(),
        payment_type: 'Regular',
        authorization_type: 'Final',
        amount: parseFloat((amountToBePaid * 100).toFixed()),
        capture: true,
        processing: {
            shipping_amount: parseFloat((shippingCost * 100).toFixed()),
            shipping_preference: shippingPreference,
        },
        items: [],
        processing_channel_id: processingChannelId,
    };

    if (shippingPreference === 'set_provided_address') {
        requestData.shipping = {
            first_name: shippingAddress.firstName,
            address: {
                address_line1: shippingAddress.address1,
                city: shippingAddress.city,
                state: shippingAddress.stateCode,
                zip: shippingAddress.postalCode,
                country: shippingAddress.countryCode.value,
            },
        };
    }

    var subTotal = 0;
    items.forEach(function(item) {
        var itemQuantity = item.quantity.value;
        var itemProratedPrice = (item.proratedPrice.value / itemQuantity);
        var itemTaxRate = item.getTaxRate();
        var unitPrice = parseFloat(((itemProratedPrice + (itemProratedPrice * itemTaxRate)) * 100).toFixed());
        if (unitPrice > 0) {
            // to avoid unit price zero error for option products
            var newItem = {
                name: item.productName,
                unit_price: unitPrice,
                quantity: itemQuantity,
            };
            subTotal += (unitPrice * itemQuantity);
            requestData.items.push(newItem);
        }
    });
    // Adjust shipping price to accomodate the rounding off error
    if (subTotal + requestData.processing.shipping_amount !== requestData.amount) {
        requestData.processing.shipping_amount = requestData.amount - subTotal;
    }

    return requestData;
}

/**
 * Handles Checkout.com Create Order Context API request
 * @returns {string} The controller response
 */
server.post('CreateOrder', function(req, res, next) {
    var shippingPreference = req.form.getFromFile || 'set_provided_address';
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.json({
            error: true,
        });
        return next();
    }

    var requestData = setRequestData(currentBasket, shippingPreference);
    var responseData;

    if (!requestData || Object.keys(requestData).length === 0) {
        res.json({
            error: true,
            message: Resource.msg('cko.paypal.invalid.request.data', 'cko', null),
        });
        return next();
    }

    responseData = ckoHelper.createContext('cko.payment.contexts.' + ckoHelper.getValue(constants.CKO_MODE) + '.service', requestData, 'POST');

    if (responseData.status === 'OK') {
        res.json({
            success: true,
            id: responseData.object.id,
            partner_metadata: responseData.object.partner_metadata,
        });
    } else if (responseData.status === 'SERVICE_UNAVAILABLE') {
        ckoHelper.restoreBasket();
        res.json({
            error: true,
            status: responseData.status,
            message: Resource.msg('error.paypal.service.unavailable', 'cko', null),
        });
    } else {
        ckoHelper.restoreBasket();
        res.json({
            error: true,
            message: Resource.msg('error.paypal.service.unavailable', 'cko', null),
        });
    }
    return next();
});

server.get('OnApprove', function(req, res, next) {
    var reqData = req.querystring ? req.querystring : '';
    var responseData;

    if (!empty(reqData)) {
        responseData = ckoHelper.createContext('cko.payment.contexts.' + ckoHelper.getValue(constants.CKO_MODE) + '.service', { id: reqData.id, isPayPalApprove: true }, 'GET');
    }

    if (responseData.status === 'OK') {
        res.json({
            success: true,
            response: responseData.object,
        });
    } else if (responseData.status === 'SERVICE_UNAVAILABLE') {
        res.json({
            error: true,
            status: responseData.status,
            message: Resource.msg('error.paypal.service.unavailable', 'cko', null),
        });
    }

    return next();
});

server.post('ExpressCheckout', function(req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var result = {};
    var response;
    var paymentContextId = req.form.paymentContextId;
    response = ckoHelper.createContext('cko.payment.contexts.' + ckoHelper.getValue(constants.CKO_MODE) + '.service', { id: paymentContextId, isPayPalApprove: true }, 'GET');
    if (response.status !== 'OK') {
        ckoHelper.restoreBasket();
        res.json({
            error: true,
            status: response.status,
            message: Resource.msg('error.paypal.service.unavailable', 'cko', null),
        });
        return next();
    }
    var responseData = response.object;
    responseData.paymentContext_id = paymentContextId;
    var ckoPayPalData = JSON.stringify(responseData);
    var emailAddress = responseData.payment_request.customer.email;

    var name = responseData.payment_request.customer.name.split(' ');
    result.address = {
        firstName: name[0],
        lastName: name[1],
        address1: responseData.payment_request.shipping.address.address_line1,
        address2: responseData.payment_request.shipping.address.address_line2 || '',
        city: responseData.payment_request.shipping.address.city,
        postalCode: responseData.payment_request.shipping.address.zip,
        countryCode: responseData.payment_request.shipping.address.country,
        phone: responseData.payment_request.shipping.address.phone && responseData.payment_request.shipping.address.phone.number ? responseData.payment_request.shipping.address.phone.number : '',
        stateCode: responseData.payment_request.shipping.address.state,
    };

    result.shippingBillingSame = true;

    COHelpers.copyShippingAddressToShipment(
        result,
        currentBasket.defaultShipment
    );

    COHelpers.recalculateBasket(currentBasket);

    if (!ckoPayPalData) {
        ckoHelper.restoreBasket();
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        return next();
    }

    var order = payPalHelper.setPaymentData(req, ckoPayPalData, result.address, emailAddress);

    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);

    if (handlePaymentResult.error === true) {
        ckoHelper.restoreBasket();
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        return next();
    }

    if (handlePaymentResult.redirectUrl) {
        ckoHelper.restoreBasket();
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
    ckoHelper.restoreBasket();
    res.json({
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString(),
    });

    return next();
});

module.exports = server.exports();
