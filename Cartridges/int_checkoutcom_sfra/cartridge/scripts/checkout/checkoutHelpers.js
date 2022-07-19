'use strict';

var checkoutHelper = module.superModule || {};

var HookMgr = require('dw/system/HookMgr');
var OrderMgr = require('dw/order/OrderMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

// static functions needed for Checkout Controller logic

// ////////////////////////////     Modified    ////////////////////////////////////////////////
/**
 * handles the payment authorization for each payment instrument
 * @param {dw.order.Order} order - the order object
 * @param {string} orderNumber - The order number for the order
 * @returns {Object} an error object
 */
function handlePayments(order, orderNumber) {
    var result = {};

    if (order.totalNetPrice !== 0.00) {
        var paymentInstruments = order.paymentInstruments;

        if (paymentInstruments.length === 0) {
            Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
            result.error = true;
        }

        if (!result.error) {
            for (var i = 0; i < paymentInstruments.length; i++) {
                var paymentInstrument = paymentInstruments[i];
                var paymentProcessor = PaymentMgr
                    .getPaymentMethod(paymentInstrument.paymentMethod)
                    .paymentProcessor;
                var authorizationResult;
                if (paymentProcessor === null) {
                    Transaction.begin();
                    paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
                    Transaction.commit();
                } else {
                    if (HookMgr.hasHook('app.payment.processor.' +
                            paymentProcessor.ID.toLowerCase())) {
                        Transaction.wrap(function() {
                            /* eslint-disable no-param-reassign */
                            order.custom.orderProcessedByABCorNAS = ckoHelper.getAbcOrNasEnabled();
                        });

                        authorizationResult = HookMgr.callHook(
                            'app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
                            'Authorize',
                            orderNumber,
                            paymentInstrument,
                            paymentProcessor
                        );
                    } else {
                        authorizationResult = HookMgr.callHook(
                            'app.payment.processor.default',
                            'Authorize'
                        );
                    }

                    if (authorizationResult.error) {
                        Transaction.wrap(function() { OrderMgr.failOrder(order, true); });
                        result.error = true;
                        break;
                    } else {
                        result = authorizationResult;
                    }
                }
            }
        }
    }

    return result;
}

/**
 * saves payment instruemnt to customers wallet
 * @param {Object} billingData - billing information entered by the user
 * @param {dw.order.Basket} currentBasket - The current basket
 * @param {dw.customer.Customer} customer - The current customer
 * @returns {dw.customer.CustomerPaymentInstrument} newly stored payment Instrument
 */
function savePaymentInstrumentToWallet(billingData, currentBasket, customer) {
    var wallet = customer.getProfile().getWallet();

    return Transaction.wrap(function() {
        var storedPaymentInstrument = wallet.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD);

        storedPaymentInstrument.setCreditCardHolder(
            currentBasket.billingAddress.fullName
        );
        storedPaymentInstrument.setCreditCardNumber(
            billingData.paymentInformation.cardNumber.value
        );
        storedPaymentInstrument.setCreditCardType(
            billingData.paymentInformation.cardType.value
        );
        storedPaymentInstrument.setCreditCardExpirationMonth(
            billingData.paymentInformation.expirationMonth.value
        );
        storedPaymentInstrument.setCreditCardExpirationYear(
            billingData.paymentInformation.expirationYear.value
        );

        var processor = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD).getPaymentProcessor();
        var token = HookMgr.callHook(
            'app.payment.processor.' + processor.ID.toLowerCase(),
            'createToken',
            {
                cardNumber: billingData.paymentInformation.cardNumber.value,
                expirationMonth: billingData.paymentInformation.expirationMonth.value,
                expirationYear: billingData.paymentInformation.expirationYear.value,
                name: currentBasket.billingAddress.fullName,
                email: currentBasket.getCustomerEmail(),
            }
        );


        storedPaymentInstrument.setCreditCardToken(token.sourceId);
        storedPaymentInstrument.custom.ckoCreditCardBin = token.bin;

        return storedPaymentInstrument;
    });
}

checkoutHelper.handlePayments = handlePayments;
checkoutHelper.savePaymentInstrumentToWallet = savePaymentInstrumentToWallet;

module.exports = checkoutHelper;
