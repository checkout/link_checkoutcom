'use strict';

// API Includes
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');

// Shopper cart
var Cart = require('*/cartridge/scripts/models/CartModel');
var BasketMgr = require('dw/order/BasketMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');

// App
var app = require('*/cartridge/scripts/app');

// Utility
var cardHelper = require('~/cartridge/scripts/helpers/cardHelper');
var ckoHelper = require('~/cartridge/scripts/helpers/ckoHelper');


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
        var token;
        if (paymentForm.object.cardToken.value && paymentForm.object.cardToken.value != 'false') {
            token = paymentForm.object.cardToken.value;
        } else {
            token = cardHelper.createToken({
                cardNumber: cardData.number,
                expirationMonth: cardData.month,
                expirationYear: cardData.year,
                name: cardData.owner,
                email: customer.profile.getEmail(),
            });
        }

        Transaction.wrap(function() {
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

        if (paymentForm.object.cardToken.value && paymentForm.object.cardToken.value != 'false') {
            paymentInstrument.setCreditCardToken(paymentForm.object.cardToken.value);
        } else if (token) {
            paymentInstrument.setCreditCardToken(token);
        }
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

    var cardAuthResult = cardHelper.cardAuthorization(cardData, args);
    if (cardAuthResult && cardAuthResult.redirected) {
        return { redirected: true };
    } else if (cardAuthResult) {
        return { success: true };
    }

    var basket = BasketMgr.getCurrentOrNewBasket();
    var paymentInstrs = basket.getPaymentInstruments();
    var iter = paymentInstrs.iterator();

    while (iter.hasNext()) {
        var existingPI = iter.next();
        if (!PaymentInstrument.METHOD_GIFT_CERTIFICATE.equals(existingPI.paymentMethod)) {
            basket.removePaymentInstrument(existingPI);
        }
    }
    return { error: true,
        PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical') };
}

// Module exports
exports.Handle = Handle;
exports.Authorize = Authorize;