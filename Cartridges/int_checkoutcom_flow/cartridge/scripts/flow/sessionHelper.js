'use strict';

var Transaction = require('dw/system/Transaction');

var flowConfig = require('*/cartridge/scripts/flow/flowConfig');
var ckoFlowService = require('*/cartridge/scripts/services/ckoFlowService');

/**
 * Builds Checkout.com payment sessions from the shopper's basket and keeps a
 * CHECKOUTCOM_FLOW payment instrument on the basket so the resulting order
 * carries a payment transaction.
 */
var sessionHelper = {
    /**
     * Convert a basket money amount to gateway minor units.
     * Currencies with non-2 exponents follow dw.util.Currency's fraction digits.
     * @param {dw.value.Money} money The amount
     * @returns {number} The amount in minor units
     */
    toMinorUnits: function(money) {
        var Currency = require('dw/util/Currency');
        var digits = Currency.getCurrency(money.currencyCode).getDefaultFractionDigits();
        return Math.round(money.value * Math.pow(10, digits));
    },

    /**
     * Replace any payment instruments on the basket with a single
     * CHECKOUTCOM_FLOW instrument covering the order total.
     * @param {dw.order.Basket} basket The basket
     * @returns {dw.order.OrderPaymentInstrument} The instrument
     */
    ensurePaymentInstrument: function(basket) {
        var instrument = null;
        Transaction.wrap(function() {
            var instruments = basket.getPaymentInstruments().toArray();
            for (var i = 0; i < instruments.length; i += 1) {
                basket.removePaymentInstrument(instruments[i]);
            }
            instrument = basket.createPaymentInstrument(flowConfig.PAYMENT_METHOD_ID, basket.getTotalGrossPrice());
        });
        return instrument;
    },

    /**
     * Build the payment-session request payload from the basket.
     * @param {dw.order.Basket} basket The basket
     * @returns {Object} The payload
     */
    buildSessionPayload: function(basket) {
        var billingAddress = basket.getBillingAddress() || basket.getDefaultShipment().getShippingAddress();
        var countryCode = billingAddress && billingAddress.getCountryCode()
            ? billingAddress.getCountryCode().getValue().toString().toUpperCase()
            : null;

        var payload = {
            amount: this.toMinorUnits(basket.getTotalGrossPrice()),
            currency: basket.getCurrencyCode(),
            reference: basket.getUUID(),
            billing: {
                address: {
                    country: countryCode,
                },
            },
            customer: {
                email: basket.getCustomerEmail() || undefined,
            },
            success_url: flowConfig.getValue(flowConfig.PREFERENCES.SUCCESS_URL),
            failure_url: flowConfig.getValue(flowConfig.PREFERENCES.FAILURE_URL),
            metadata: {
                basket_id: basket.getUUID(),
                integration: 'sfcc_b2c_flow',
            },
        };

        if (billingAddress) {
            payload.billing.address.address_line1 = billingAddress.getAddress1() || undefined;
            payload.billing.address.city = billingAddress.getCity() || undefined;
            payload.billing.address.zip = billingAddress.getPostalCode() || undefined;
        }

        var processingChannelId = flowConfig.getValue(flowConfig.PREFERENCES.PROCESSING_CHANNEL_ID);
        if (processingChannelId) {
            payload.processing_channel_id = processingChannelId;
        }

        return payload;
    },

    /**
     * Create a payment session for the basket. Replaces the basket's payment
     * instruments and records the session id on the instrument.
     * @param {dw.order.Basket} basket The basket
     * @returns {Object} Result: {ok, session|errorMessage}
     */
    createSession: function(basket) {
        var payload = this.buildSessionPayload(basket);
        if (!payload.billing.address.country) {
            return { ok: false, errorMessage: 'Basket has no billing or shipping country yet' };
        }

        var result = ckoFlowService.createPaymentSession(payload);
        if (!result.ok || !result.object || !result.object.id) {
            return { ok: false, errorMessage: result.errorMessage || 'Payment session creation failed' };
        }

        var instrument = this.ensurePaymentInstrument(basket);
        Transaction.wrap(function() {
            instrument.custom.ckoFlowSessionId = result.object.id;
        });

        return { ok: true, session: result.object };
    },
};

module.exports = sessionHelper;
