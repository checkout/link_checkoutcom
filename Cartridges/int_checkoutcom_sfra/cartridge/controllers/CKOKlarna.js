/**
 * Klarna controller.
 */

'use strict';

/* Server */
var server = require('server');

/* API Includes */
var BasketMgr = require('dw/order/BasketMgr');
var Resource = require('dw/web/Resource');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');

var errorCodeMapping = {
    billing_country_invalid: Resource.msg('cko.klarna.error.billing.country.invalid', 'cko', null),
    currency_not_supported: Resource.msg('cko.klarna.error.currency.invalid', 'cko', null),
    generic_error: Resource.msg('cko.klarna.generic.error', 'cko', null),
};

/**
 * Error Mapping
 * @param {Object} errorMessage service response
 * @returns {string} error message
 */
function getKlarnaErrorMessage(errorMessage) {
    var responseObj = JSON.parse(errorMessage);
    return (responseObj.error_codes && errorCodeMapping[responseObj.error_codes[0]]) || errorCodeMapping.generic_error;
}

/**
 * Handles Checkout.com Create Order Context API request
 * @returns {string} The controller response
 */
server.post('CreateContext', function(req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var Site = require('dw/system/Site');
    var errorMessage;
    try {
        var billingCountryCode = '';

        if (req.form.billingCountry) {
            billingCountryCode = req.form.billingCountry;
        } else if (currentBasket.billingAddress && currentBasket.billingAddress.countryCode) {
            billingCountryCode = currentBasket.billingAddress.countryCode.value;
        } else if (currentBasket.defaultShipment.shippingAddress && currentBasket.defaultShipment.shippingAddress.countryCode) {
            billingCountryCode = currentBasket.defaultShipment.shippingAddress.countryCode.value;
        }
        var requestData = {
            currency: currentBasket.getCurrencyCode(),
            amount: currentBasket.totalGrossPrice.value * 100,
            source: {
                type: 'klarna',
                account_holder: {
                    billing_address: {
                        country: billingCountryCode,
                    },
                },
            },
            items: [
            ],
            processing: {
                locale: 'en-GB',
            },
            processing_channel_id: Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId'),
        };

        var subTotal = 0;
        (currentBasket.allProductLineItems).toArray().forEach(function(item) {
            var itemQuantity = item.quantity.value;
            var itemProratedPrice = (item.proratedPrice.value / itemQuantity);
            var unitPrice = parseFloat((itemProratedPrice * 100).toFixed());
            if (unitPrice > 0) {
                var newItem = {
                    name: item.productName,
                    unit_price: unitPrice,
                    total_amount: unitPrice * itemQuantity,
                    quantity: itemQuantity,
                    reference: item.getUUID(),
                };
                subTotal += (unitPrice * itemQuantity);
                requestData.items.push(newItem);
            }
        });
        // Adjust shipping price to accomodate the rounding off error
        if (subTotal + requestData.processing.shipping_amount !== requestData.amount) {
            requestData.processing.shipping_amount = requestData.amount - subTotal;
        }

        var responseData = ckoHelper.createContext('cko.payment.contexts.' + ckoHelper.getValue(constants.CKO_MODE) + '.service', requestData, 'POST');
        if (responseData.status === 'OK') {
            res.json({
                success: true,
                id: responseData.object.id,
                partner_metadata: responseData.object.partner_metadata,
            });
            return next();
        }

        errorMessage = getKlarnaErrorMessage(responseData.errorMessage);
    } catch (error) {
        Logger.error('Error While Creating the context for Klarna. Error Details: ' + error.message);
        errorMessage = errorCodeMapping.generic_error;
    }

    var errorTitle = Resource.msg('cko.klarna.generic.error.title', 'cko', null);

    res.setStatusCode(500);
    res.json({
        error: true,
        message: errorMessage,
        errorTitle: errorTitle,
    });
    return next();
});

/**
 * Handles Checkout.com Create Order Context API request
 * @returns {string} The controller response
 */
server.post('OnApprove', function(req, res, next) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');
    var Transaction = require('dw/system/Transaction');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var orderId = req.form.orderID;
    var OrderMgr = require('dw/order/OrderMgr');
    var URLUtils = require('dw/web/URLUtils');
    var order = OrderMgr.getOrder(orderId);
    var authorizeKlarna = true;
    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo, authorizeKlarna);
    if (handlePaymentResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null),
        });
        return next();
    }

    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', order, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
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

/*
 * Module exports
 */
module.exports = server.exports();
