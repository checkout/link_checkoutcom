'use strict';

/* API Includes */
var Transaction = require('dw/system/Transaction');
var BasketMgr = require('dw/order/BasketMgr');
var HookMgr = require('dw/system/HookMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Resource = require('dw/web/Resource');
var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var orderGuard = require('*/cartridge/scripts/helpers/orderGuard');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions.
 */
var payPalHelper = {
    /**
     * Handle the payment request.
     * @param {Object} paymentData The payment data
     * @param {string} processorId The processor ID
     * @param {string} orderNumber The order number
     * @returns {boolean} The request success or failure
     */
    handleRequest: function(paymentData, processorId, orderNumber) {
        var order = OrderMgr.getOrder(orderNumber);
        var rawIP = ckoHelper.getHost();
        var formattedIP = ckoHelper.formatCustomerIP(rawIP);
        // Load the order information
        var gatewayResponse = null;
        var gatewayRequest = null;

        // If the request is valid, process the response
        if (paymentData) {
            // The payment data comes from the browser: only its context id is used.
            // The channel is the site's own, and the amount is checked afterwards
            var requestData = JSON.parse(paymentData);
            var processingChannelId = Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId');
            gatewayRequest = {
                payment_context_id: requestData.paymentContext_id,
                reference: order.orderNo,
                customer: ckoHelper.getCustomer(order),
                risk: {
                    enabled: ckoHelper.getValue(constants.CKO_ENABLE_RISK_FLAG),
                    device: {
                        network: formattedIP
                    }
                },
                metadata: ckoHelper.getMetadata({}, processorId),
            };

            if (processingChannelId) {
                gatewayRequest.processing_channel_id = processingChannelId;
            }

            // Log the payment request data
            ckoHelper.log(processorId + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

            // Perform the request to the payment gateway
            gatewayResponse = ckoHelper.gatewayClientRequest('cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service', gatewayRequest, 'POST');
        }

        // Process the response
        var result = this.handleResponse(gatewayResponse);

        return result.error ? result : this.checkPaidAmount(order, result);
    },

    /**
     * The PayPal context was created for the basket as it was then: the payment
     * must still be for the order's amount and currency, or it is released and
     * the order is not placed.
     * @param {dw.order.Order} order The order
     * @param {Object} result The accepted payment result (transactionID)
     * @returns {Object} The result, or an error result
     */
    checkPaidAmount: function(order, result) {
        var payment = ckoHelper.gatewayClientRequest(
            'cko.verify.charges.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
            { paymentToken: result.transactionID }
        );
        var expected = Number(ckoHelper.getAmount(order));

        if (payment && payment.id && payment.amount === expected
            && String(payment.currency).toUpperCase() === String(order.getCurrencyCode()).toUpperCase()) {
            return result;
        }

        Logger.getLogger('checkoutcom').error(
            'PayPal payment {0} for order {1} is not for the order total ({2} {3}): {4} {5}. Released.',
            result.transactionID, order.orderNo, expected, order.getCurrencyCode(),
            payment ? payment.amount : null, payment ? payment.currency : null
        );

        if (payment && payment.id) {
            orderGuard.reversePayment(payment, order.orderNo);
        } else {
            // Not readable now: whatever was taken under the order's reference
            orderGuard.reverseStrayPayments(order.orderNo);
        }

        return { error: true, redirectUrl: false, transactionID: '' };
    },

    /**
     * Handle the payment response.
     * @param {Object} gatewayResponse The gateway response data
     * @returns {Object} The payment success or failure
     */
    handleResponse: function(gatewayResponse) {
        // Prepare the result
        var result = {
            error: !ckoHelper.paymentResponseValidation(gatewayResponse),
            redirectUrl: false,
        };

        if (gatewayResponse) {
            result.transactionID = gatewayResponse.id ? gatewayResponse.id : '';
        }

        return result;
    },
    setPaymentData: function(req, ckoPayPalData, shippingAddress, emailAddress) {
        var currentBasket = BasketMgr.getCurrentOrNewBasket();

        var viewData = {};
        var paymentForm = {
            payPalForm: {
                ckoPayPalData: {
                    htmlValue: ckoPayPalData,
                    value: ckoPayPalData,
                },
            },
            paymentMethod: {
                htmlValue: 'CHECKOUTCOM_PAYPAL',
            },
        };

        viewData.address = {
            firstName: { value: shippingAddress.firstName },
            lastName: { value: shippingAddress.lastName },
            address1: { value: shippingAddress.address1 },
            address2: { value: shippingAddress.address2 },
            city: { value: shippingAddress.city },
            postalCode: { value: shippingAddress.postalCode },
            countryCode: { value: shippingAddress.countryCode },
            phone: { value: shippingAddress.phoneNumber },
            stateCode: { value: shippingAddress.stateCode },
        };

        var billingAddress = currentBasket.billingAddress;
        Transaction.wrap(function() {
            if (!billingAddress) {
                billingAddress = currentBasket.createBillingAddress();
            }

            billingAddress.setFirstName(shippingAddress.firstName);
            billingAddress.setLastName(shippingAddress.lastName);
            billingAddress.setAddress1(shippingAddress.address1);
            billingAddress.setAddress2(shippingAddress.address2);
            billingAddress.setCity(shippingAddress.city);
            billingAddress.setPostalCode(shippingAddress.postalCode);
            billingAddress.setStateCode(shippingAddress.stateCode);
            billingAddress.setCountryCode(shippingAddress.countryCode);
            billingAddress.setPhone(shippingAddress.phoneNumber);

            currentBasket.customerEmail = emailAddress;
        });


        var paymentMethodIdValue = 'CHECKOUTCOM_PAYPAL';
        if (!PaymentMgr.getPaymentMethod(paymentMethodIdValue).paymentProcessor) {
            throw new Error(Resource.msg(
                'error.payment.processor.missing',
                'checkout',
                null
            ));
        }

        var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethodIdValue).getPaymentProcessor();

        var paymentFormResult;
        if (HookMgr.hasHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase())) {
            paymentFormResult = HookMgr.callHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase(),
                'processForm',
                {},
                paymentForm,
                viewData);
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
                req);
        } else {
            hookResult = HookMgr.callHook('app.payment.processor.default', 'Handle');
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
    },
};

/**
 * Module exports
 */
module.exports = payPalHelper;
