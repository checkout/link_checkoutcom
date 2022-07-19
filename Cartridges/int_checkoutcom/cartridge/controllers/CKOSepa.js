'use strict';

// Script Modules
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');
var URLUtils = require('dw/web/URLUtils');
var OrderMgr = require('dw/order/OrderMgr');
var Order = app.getModel('Order');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');

// Utility
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var apmHelper = require('*/cartridge/scripts/helpers/apmHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Initiate the mandate session.
 * @returns {Object} The gateway response
 */
function mandate() {
    // Prepare the varirables
    // eslint-disable-next-line
    var orderId = ckoHelper.getOrderId();
    var order = OrderMgr.getOrder(orderId);

    // Process the URL
    if (order) {
        var paymentInstruments = order.getPaymentInstruments();
        var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1].getPaymentTransaction().getAmount().getValue().toFixed(2);

        app.getView({
            // Prepare the view parameters
            creditAmount: order.totalGrossPrice.value.toFixed(2),
            formatedAmount: ckoHelper.getFormattedPrice(paymentInstrumentAmount, ckoHelper.getCurrency()),
            debtor: order.billingAddress.fullName,
            debtorAddress1: order.billingAddress.address1,
            debtorAddress2: order.billingAddress.address2,
            debtorCity: order.billingAddress.city,
            debtorPostCode: order.billingAddress.postalCode,
            debtorStateCode: order.billingAddress.stateCode,
            debtorCountryCode: order.billingAddress.countryCode.toString().toLocaleUpperCase(),

            // Prepare the creditor information
            creditor: ckoHelper.upperCaseFirst(ckoHelper.getValue(constants.CKO_BUSINESS_NAME)),
            creditorAddress1: ckoHelper.upperCaseFirst(ckoHelper.getValue(constants.CKO_BUSINESS_ADDRESS_LINE1)),
            creditorAddress2: ckoHelper.upperCaseFirst(ckoHelper.getValue(constants.CKO_BUSINESS_ADDRESS_LINE2)),
            creditorCity: ckoHelper.upperCaseFirst(ckoHelper.getValue(constants.CKO_BUSINESS_CITY)),
            creditorCountry: ckoHelper.upperCaseFirst(ckoHelper.getValue(constants.CKO_BUSINESS_COUNTRY)),
            ContinueURL: URLUtils.https('CKOSepa-HandleMandate'),
        }).render('sepaForm');
    } else {
        // Write the response
        return ckoHelper.ckoResponse(ckoHelper._('cko.sepa.error', 'cko'));
    }

    return null;
}

/**
 * Confirms the mandate
 */
function handleMandate() {
    var orderId = ckoHelper.getOrderId();
    app.getForm('sepaForm').handleAction({
        cancel: function() {
            // Clear form
            app.getForm('sepaForm').clear();

            if (orderId) {
                // Load the order
                var order = OrderMgr.getOrder(orderId);
                Transaction.wrap(function() {
                    OrderMgr.failOrder(order, true);
                });
            }

            app.getController('COBilling').Start();
        },
        submit: function() {
            var sepa = app.getForm('sepaForm');
            var mandateValue = sepa.get('mandate').value();

            // If mandate is true
            if (mandateValue) {
                // Clear form
                app.getForm('sepaForm').clear();

                // Get the response object from session
                // eslint-disable-next-line
                var responseObjectId = session.privacy.sepaResponseId;

                // Load the order
                var order = OrderMgr.getOrder(orderId);
                var paymentInstruments = order.getPaymentInstruments();
                var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1].getPaymentTransaction().getAmount().getValue().toFixed(2);
                if (responseObjectId) {
                    // Prepare the payment object
                    var payObject = {
                        source: {
                            type: 'id',
                            id: responseObjectId,
                        },
                        amount: ckoHelper.getFormattedPrice(paymentInstrumentAmount, ckoHelper.getCurrency()),
                        currency: ckoHelper.getCurrency(),
                        reference: orderId,
                        metadata: ckoHelper.getMetadata({}, 'CHECKOUTCOM_APM'),
                    };

                    // Reset the response in session
                    // eslint-disable-next-line
                    session.privacy.sepaResponseId = null;

                    // Handle the SEPA request
                    var sepaRequest = apmHelper.handleSepaControllerRequest(payObject, order);
                    if (sepaRequest) {
                        if (apmHelper.handleApmChargeResponse(sepaRequest, order)) {
                            var orderPlacementStatus = Order.submit(order);
                            if (orderPlacementStatus.error) {
                                Transaction.wrap(function() {
                                    OrderMgr.failOrder(order, true);
                                });

                                // Return to the billing start page
                                app.getController('COBilling').Start();
                            } else {
                                // Show the confirmation screen
                                app.getController('COSummary').ShowConfirmation(order);
                            }
                        } else {
                            // Return to the billing start page
                            app.getController('COBilling').Start();
                        }
                    } else {
                        // Return to the billing start page
                        app.getController('COBilling').Start();
                    }
                } else {
                    // Restore the cart
                    Transaction.wrap(function() {
                        OrderMgr.failOrder(order, true);
                    });

                    // Send back to the error page
                    app.getController('COSummary').Start({
                        PlaceOrderError: new Status(Status.ERROR, 'confirm.error.declined'),
                    });
                }
            } else {
                // load the mandate form
                mandate();
            }
        },
    });
}

// Module exports
exports.Mandate = guard.ensure(['get', 'https'], mandate);
exports.HandleMandate = guard.ensure(['post', 'https'], handleMandate);
