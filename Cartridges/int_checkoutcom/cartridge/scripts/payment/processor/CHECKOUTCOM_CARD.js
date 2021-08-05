'use strict';

// API Includes
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var Transaction = require('dw/system/Transaction');

// Site controller
var Site = require('dw/system/Site');

// Shopper cart
var Cart = require('*/cartridge/scripts/models/CartModel');

// App
var app = require('*/cartridge/scripts/app');

// Utility
var cardHelper = require('~/cartridge/scripts/helpers/cardHelper');
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');

/**
 * Creates a token. This should be replaced by utilizing a tokenization provider
 * @param {Object} paymentData The data of the payment
 * @returns {string} a token
 */
 function createToken(paymentData) {
    // Prepare the parameters
    var requestData = {
        type: 'card',
        number: paymentData.cardNumber.toString(),
        expiry_month: paymentData.expirationMonth,
        expiry_year: paymentData.expirationYear,
        name: paymentData.name,
    };

    // Perform the request to the payment gateway - get the card token
    var tokenResponse = ckoHelper.gatewayClientRequest(
        'cko.network.token.' + ckoHelper.getValue('ckoMode') + '.service',
        JSON.stringify(requestData)
    );

    if (tokenResponse && tokenResponse !== 400) {
        requestData = {
            source: {
                type: 'token',
                token: tokenResponse.token,
            },
            currency: Site.getCurrent().getDefaultCurrency(),
            risk: {enabled: ckoHelper.getValue('ckoEnableRiskFlag')},
            billing_descriptor: ckoHelper.getBillingDescriptorObject(),
        };
    }

    var idResponse = ckoHelper.gatewayClientRequest(
        'cko.card.charge.' + ckoHelper.getValue('ckoMode') + '.service',
        requestData
    );

    if (idResponse && idResponse !== 400) {
        return idResponse.source.id;
    }

    return '';
}

/**
 * Verifies that the payment data is valid.
 * @param {Object} args The method arguments
 * @returns {Object} The form validation result
 */
function Handle(args) {
    var cart = Cart.get(args.Basket);
    var paymentMethod = args.PaymentMethodID;

    // Get card payment form
    var paymentForm = app.getForm('cardPaymentForm');

    // Prepare card data object
    var cardData = {
        owner: paymentForm.get('owner').value(),
        number: ckoHelper.getFormattedNumber(paymentForm.get('number').value()),
        month: paymentForm.get('expiration.month').value(),
        year: paymentForm.get('expiration.year').value(),
        cvn: paymentForm.get('cvn').value(),
        cardType: paymentForm.get('type').value(),
    };

    // Validate expiration date
    if (cardData.year === new Date().getFullYear() && cardData.month < new Date().getMonth() + 1) {
        paymentForm.get('expiration.month').invalidateFormElement();
        paymentForm.get('expiration.year').invalidateFormElement();

        return { error: true };
    }

    // Save card feature
    if (paymentForm.get('saveCard').value()) {
        var i,
            creditCards,
            newCreditCard;

        // eslint-disable-next-line
        creditCards = customer.profile.getWallet().getPaymentInstruments(paymentMethod);

        Transaction.wrap(function() {
            var processor = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD).getPaymentProcessor();
            var HookMgr = require('dw/system/HookMgr');
            var token = createToken(
                {
                    cardNumber: cardData.number,
                    expirationMonth: cardData.month,
                    expirationYear: cardData.year,
                    name: cardData.owner,
                }
            );
            // eslint-disable-next-line
            newCreditCard = customer.profile.getWallet().createPaymentInstrument(paymentMethod);

            // copy the credit card details to the payment instrument
            newCreditCard.setCreditCardHolder(cardData.owner);
            newCreditCard.setCreditCardNumber(cardData.number);
            newCreditCard.setCreditCardExpirationMonth(cardData.month);
            newCreditCard.setCreditCardExpirationYear(cardData.year);
            newCreditCard.setCreditCardType(cardData.cardType);
            newCreditCard.setCreditCardToken(token);

            for (i = 0; i < creditCards.length; i++) {
                var creditcard = creditCards[i];

                if (creditcard.maskedCreditCardNumber === newCreditCard.maskedCreditCardNumber && creditcard.creditCardType === newCreditCard.creditCardType) {
                    // eslint-disable-next-line
                	customer.profile.getWallet().removePaymentInstrument(creditcard);
                }
            }
        });
    }

    // Proceed with transaction
    Transaction.wrap(function() {
        cart.removeExistingPaymentInstruments(paymentMethod);
        var paymentInstrument = cart.createPaymentInstrument(paymentMethod, cart.getNonGiftCertificateAmount());
        paymentInstrument.creditCardHolder = cardData.owner;
        paymentInstrument.creditCardNumber = cardData.number;
        paymentInstrument.creditCardExpirationMonth = cardData.month;
        paymentInstrument.creditCardExpirationYear = cardData.year;
        paymentInstrument.creditCardType = cardData.cardType;
    });

    return { success: true };
}


/**
 * Authorises a payment.
 * @param {Object} args The method arguments
 * @returns {Object} The payment success or failure
 */
function Authorize(args) {
    // Preparing payment parameters
    var paymentInstrument = args.PaymentInstrument;

    // Add order number to the session global object
    // eslint-disable-next-line
    session.privacy.ckoOrderId = args.OrderNo;

    // Get card payment form
    var paymentForm = app.getForm('cardPaymentForm');

    // Build card data object
    var cardData = {
        name: paymentInstrument.creditCardHolder,
        number: ckoHelper.getFormattedNumber(paymentForm.get('number').value()),
        expiryMonth: paymentInstrument.creditCardExpirationMonth,
        expiryYear: paymentInstrument.creditCardExpirationYear,
        cvv: paymentForm.get('cvn').value(),
        type: paymentInstrument.creditCardType,
        creditCardToken: paymentInstrument.getCreditCardToken(),
    };

    if (cardHelper.cardAuthorization(cardData, args)) {
        return { success: true };
    }
    return { error: true };
}

// Module exports
exports.Handle = Handle;
exports.Authorize = Authorize;
exports.createToken = createToken;
