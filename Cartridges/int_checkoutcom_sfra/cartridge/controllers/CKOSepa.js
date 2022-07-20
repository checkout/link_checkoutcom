'use strict';

/* Server */
var server = require('server');

/* Script Modules */
var URLUtils = require('dw/web/URLUtils');
var OrderMgr = require('dw/order/OrderMgr');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var apmHelper = require('*/cartridge/scripts/helpers/apmHelper');
var paymentHelper = require('*/cartridge/scripts/helpers/paymentHelper');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Initiate the SEPA mandate session.
 * @returns {string} The controller response
 */
server.get('Mandate', server.middleware.https, function(req, res, next) {
    // Prepare the variables
    var request = req;
    var sepaResponseId = request.querystring.sepaResponseId;
    var orderId = request.querystring.orderNumber;
    var order = OrderMgr.getOrder(orderId);

    // Process the URL
    if (order) {
        res.render('sepaForm', {
            // Prepare the view parameters
            creditAmount: order.totalGrossPrice.value.toFixed(2),
            formatedAmount: ckoHelper.getFormattedPrice(
                order.totalGrossPrice.value.toFixed(2),
                order.getCurrencyCode()
            ),
            debtor: order.defaultShipment.shippingAddress.firstName + ' ' + order.defaultShipment.shippingAddress.lastName,
            debtorAddress1: order.billingAddress.address1,
            debtorAddress2: order.billingAddress.address2,
            debtorCity: order.billingAddress.city,
            debtorPostCode: order.billingAddress.postalCode,
            debtorStateCode: order.billingAddress.stateCode,
            debtorCountryCode: order.billingAddress.countryCode,

            // Prepare the creditor information
            creditor: ckoHelper.getValue(constants.CKO_BUSINESS_NAME),
            creditorAddress1: ckoHelper.getValue(constants.CKO_BUSINESS_ADDRESS_LINE1),
            creditorAddress2: ckoHelper.getValue(constants.CKO_BUSINESS_ADDRESS_LINE2),
            creditorCity: ckoHelper.getValue(constants.CKO_BUSINESS_CITY),
            creditorCountry: ckoHelper.getValue(constants.CKO_BUSINESS_COUNTRY),
            orderNumber: orderId,
            sepaResponseId: sepaResponseId,
            ContinueURL: URLUtils.https('CKOSepa-HandleMandate'),
        });
    } else {
        return next(
            new Error(
                Resource.msg(
                    'cko.payment.invalid',
                    'cko',
                    null
                )
            )
        );
    }

    return next();
});

/**
 * Handle the SEPA mandates.
 * @returns {string} The controller response
 */
server.post('HandleMandate', server.middleware.https, function(req, res, next) {
    // Get the form
    var request = req;
    var sepaForm = request.form;

    // Get the order id from mandate form
    var orderId = sepaForm.orderNumber;
    var sepaResponseId = sepaForm.sepaResponseId;
    var placeOrderResult;

    // Validation
    if (sepaForm.submit) {
        var mandate = sepaForm.mandate;
        this.on('route:BeforeComplete', function() {
            // Mandate is true
            if (mandate) {
                var mandateForm = server.forms.getForm('sepaForm'); // gets the mandate form object
                mandateForm.clear();

                // Get the response object from session
                var responseObjectId = sepaResponseId;
                if (responseObjectId) {
                    if (orderId) {
                        // Load the order
                        var order = OrderMgr.getOrder(orderId);

                        // Prepare the payment object
                        var payObject = {
                            source: {
                                type: 'id',
                                id: responseObjectId,
                            },
                            amount: ckoHelper.getFormattedPrice(
                                order.totalGrossPrice.value.toFixed(2),
                                order.getCurrencyCode()
                            ),
                            currency: order.getCurrencyCode(),
                            reference: orderId,
                            metadata: ckoHelper.getMetadata({}, 'CHECKOUTCOM_APM'),
                        };

                        // Handle the SEPA request
                        var handleSepaResult = apmHelper.handleSepaRequest(payObject, order);

                        if (handleSepaResult) {
                            placeOrderResult = COHelpers.placeOrder(order, { status: '' });

                            if (placeOrderResult.error) {
                                Transaction.wrap(function() {
                                    OrderMgr.failOrder(order, true);
                                });

                                paymentHelper.getFailurePageRedirect(res);
                            }
                            // Show the confirmation screen
                            paymentHelper.getConfirmationPageRedirect(res, order);
                        } else {
                            paymentHelper.getFailurePageRedirect(res);
                        }
                    } else {
                        paymentHelper.getFailurePageRedirect(res);
                    }
                } else {
                    return next(
                        new Error(
                            Resource.msg(
                                'cko.payment.invalid',
                                'cko',
                                null
                            )
                        )
                    );
                }
            } else {
                return next(
                    new Error(
                        Resource.msg(
                            'cko.payment.invalid',
                            'cko',
                            null
                        )
                    )
                );
            }

            return next();
        });
    } else if (sepaForm.cancel) {
        if (orderId) {
            // Load the order
            var sepaDebitForm = server.forms.getForm('sepaForm');
            sepaDebitForm.clear();

            var order = OrderMgr.getOrder(orderId);
            Transaction.wrap(function() {
                OrderMgr.failOrder(order, true);
            });

            paymentHelper.getPaymentPageRedirect(res);
        }
    } else {
        return next(
            new Error(
                Resource.msg(
                    'cko.payment.invalid',
                    'cko',
                    null
                )
            )
        );
    }

    return next();
});

/*
 * Module exports
 */
module.exports = server.exports();
