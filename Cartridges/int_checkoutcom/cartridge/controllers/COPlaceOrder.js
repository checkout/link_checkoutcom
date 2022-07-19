/* eslint-disable consistent-return */
/* eslint-disable no-undef */
/* eslint-disable no-use-before-define */
'use strict';

/**
 * Controller that creates an order from the current basket. It's a pure processing controller and does
 * no page rendering. The controller is used by checkout and is called upon the triggered place order action.
 * It contains the actual logic to authorize the payment and create the order. The controller communicates the result
 * of the order creation process and uses a status object PlaceOrderError to set proper error states.
 * The calling controller is must handle the results of the order creation and evaluate any errors returned by it.
 *
 * @module controllers/COPlaceOrder
 */

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');

/* Script Modules */
var base = module.superModule;
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');

var Cart = app.getModel('Cart');
var Order = app.getModel('Order');
var PaymentProcessor = app.getModel('PaymentProcessor');
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/**
 * Responsible for payment handling. This function uses PaymentProcessorModel methods to
 * handle payment processing specific to each payment instrument. It returns an
 * error if any of the authorizations failed or a payment
 * instrument is of an unknown payment method. If a payment method has no
 * payment processor assigned, the payment is accepted as authorized.
 *
 * @transactional
 * @param {dw.order.Order} order - the order to handle payments for.
 * @return {Object} JSON object containing information about missing payments, errors, or an empty object if the function is successful.
 */
function handlePayments(order) {
    if (order.getTotalNetPrice().value !== 0.00) {
        var paymentInstruments = order.getPaymentInstruments();

        if (paymentInstruments.length === 0) {
            return {
                missingPaymentInfo: true,
            };
        }
        /**
         * Sets the transaction ID for the payment instrument.
         */
        var handlePaymentTransaction = function() {
            // eslint-disable-next-line block-scoped-var
            paymentInstrument.getPaymentTransaction().setTransactionID(order.getOrderNo());
        };

        for (var i = 0; i < paymentInstruments.length; i++) {
            var paymentInstrument = paymentInstruments[i];
            if (PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor() === null) {
                Transaction.wrap(handlePaymentTransaction);
            } else {
                Transaction.wrap(function() {
                    /* eslint-disable no-param-reassign */
                    order.custom.orderProcessedByABCorNAS = ckoHelper.getAbcOrNasEnabled();
                });

                var authorizationResult = PaymentProcessor.authorize(order, paymentInstrument);

                if (authorizationResult.not_supported || authorizationResult.error) {
                    return {
                        error: true,
                    };
                }
                return authorizationResult;
            }
        }
    }

    return {};
}

/**
 * The entry point for order creation. This function is not exported, as this controller must only
 * be called by another controller.
 *
 * @transactional
 * @return {Object} JSON object that is empty, contains error information, or PlaceOrderError status information.
 */
function start() {
    var cart = Cart.get();

    if (!cart) {
        app.getController('Cart').Show();
        return {};
    }

    var COShipping = app.getController('COShipping');

    // Clean shipments.
    COShipping.PrepareShipments(cart);

    // Make sure there is a valid shipping address, accounting for gift certificates that do not have one.
    if (cart.getProductLineItems().size() > 0 && cart.getDefaultShipment().getShippingAddress() === null) {
        COShipping.Start();
        return {};
    }

    // Make sure the billing step is fulfilled, otherwise restart checkout.
    if (!session.forms.billing.fulfilled.value) {
        app.getController('COCustomer').Start();
        return {};
    }

    Transaction.wrap(function() {
        cart.calculate();
    });

    var COBilling = app.getController('COBilling');

    Transaction.wrap(function() {
        if (!COBilling.ValidatePayment(cart)) {
            COBilling.Start();
            return {};
        }
    });

    // Recalculate the payments. If there is only gift certificates, make sure it covers the order total, if not
    // back to billing page.
    Transaction.wrap(function() {
        if (!cart.calculatePaymentTransactionTotal()) {
            COBilling.Start();
            return {};
        }
    });

    // Handle used addresses and credit cards.
    var saveCCResult = COBilling.SaveCreditCard();

    if (!saveCCResult) {
        return {
            error: true,
            PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical'),
        };
    }

    // Creates a new order. This will internally ReserveInventoryForOrder and will create a new Order with status
    // 'Created'.
    var order = cart.createOrder();

    if (!order) {
        // TODO - need to pass BasketStatus to Cart-Show ?
        app.getController('Cart').Show();

        return {};
    }
    var handlePaymentsResult = handlePayments(order);
    var paymentRedirectUrl;
    if (handlePaymentsResult.error) {
        return Transaction.wrap(function() {
            OrderMgr.failOrder(order);
            return {
                error: true,
                PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical'),
            };
        });
    } else if (handlePaymentsResult.missingPaymentInfo) {
        return Transaction.wrap(function() {
            OrderMgr.failOrder(order);
            return {
                error: true,
                PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical'),
            };
        });
    }

    if (handlePaymentsResult && handlePaymentsResult.redirectURL) {
        paymentRedirectUrl = handlePaymentsResult.redirectURL;
    }

    if (paymentRedirectUrl) {
        response.redirect(paymentRedirectUrl);
        return {
            error: false,
        };
    }

    var orderPlacementStatus = Order.submit(order);
    if (!orderPlacementStatus.error) {
        clearForms();
    }
    return orderPlacementStatus;
}

// eslint-disable-next-line require-jsdoc
function clearForms() {
    // Clears all forms used in the checkout process.
    session.forms.singleshipping.clearFormElement();
    session.forms.multishipping.clearFormElement();
    session.forms.billing.clearFormElement();
}


module.exports = Object.create(base, {
    Start: {
        value: guard.ensure(['https', 'post', 'csrf'], start),
    },
});
