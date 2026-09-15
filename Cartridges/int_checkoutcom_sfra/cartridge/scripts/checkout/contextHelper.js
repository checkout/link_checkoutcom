'use strict';

var Site = require('dw/system/Site');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Transport-neutral creation of Checkout.com payment contexts (Klarna, Tabby).
 * Used by the SFRA controllers and by the SCAPI payment-contexts custom endpoint.
 */
var contextHelper = {
    /**
     * Build the Klarna payment-context request from a basket.
     * @param {dw.order.Basket} basket The basket
     * @param {string} [billingCountry] Optional billing country override
     * @returns {Object} The payment-context request payload
     */
    buildKlarnaContextRequest: function(basket, billingCountry) {
        var billingCountryCode = billingCountry || '';
        if (!billingCountryCode) {
            if (basket.billingAddress && basket.billingAddress.countryCode) {
                billingCountryCode = basket.billingAddress.countryCode.value;
            } else if (basket.defaultShipment.shippingAddress && basket.defaultShipment.shippingAddress.countryCode) {
                billingCountryCode = basket.defaultShipment.shippingAddress.countryCode.value;
            }
        }

        var requestData = {
            currency: basket.getCurrencyCode(),
            amount: basket.totalGrossPrice.value * 100,
            source: {
                type: 'klarna',
                account_holder: {
                    billing_address: {
                        country: billingCountryCode,
                    },
                },
            },
            items: [],
            processing: {
                locale: 'en-GB',
            },
            processing_channel_id: Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId'),
        };

        var subTotal = 0;
        basket.allProductLineItems.toArray().forEach(function(item) {
            var itemQuantity = item.quantity.value;
            var itemProratedPrice = (item.proratedPrice.value / itemQuantity);
            var unitPrice = parseFloat((itemProratedPrice * 100).toFixed());
            if (unitPrice > 0) {
                requestData.items.push({
                    name: item.productName,
                    unit_price: unitPrice,
                    total_amount: unitPrice * itemQuantity,
                    quantity: itemQuantity,
                    reference: item.getUUID(),
                });
                subTotal += (unitPrice * itemQuantity);
            }
        });
        // Adjust shipping price to accommodate the rounding off error
        if (subTotal + requestData.processing.shipping_amount !== requestData.amount) {
            requestData.processing.shipping_amount = requestData.amount - subTotal;
        }

        return requestData;
    },

    /**
     * Create a gateway payment context for a basket.
     * @param {dw.order.Basket} basket The basket
     * @param {string} type The context type ('klarna'|'tabby')
     * @param {Object} [options] Optional settings (billingCountry)
     * @returns {Object} Result: {success, id, paymentType, partnerMetadata} or {success: false, errorMessage}
     */
    createPaymentContext: function(basket, type, options) {
        var requestData;
        if (type === 'klarna') {
            requestData = this.buildKlarnaContextRequest(basket, options && options.billingCountry);
        } else if (type === 'tabby') {
            var tabbyHelper = require('*/cartridge/scripts/helpers/tabbyHelper');
            requestData = tabbyHelper.buildContextRequest(basket);
        } else {
            return { success: false, errorMessage: 'Unsupported payment context type: ' + type };
        }

        var serviceId = 'cko.payment.contexts.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';
        var responseData = ckoHelper.createContext(serviceId, requestData, 'POST');

        if (responseData.status !== 'OK') {
            return { success: false, errorMessage: responseData.errorMessage };
        }

        var result = {
            success: true,
            id: responseData.object.id,
            partnerMetadata: responseData.object.partner_metadata,
        };
        if (type === 'tabby') {
            var types = responseData.object.available_payment_types;
            if (!types || types.length === 0) {
                return { success: false, errorMessage: 'Tabby is not available for this basket' };
            }
            result.paymentType = types[0].payment_type || 'Installment';
        }

        return result;
    },
};

/**
 * Module exports
 */
module.exports = contextHelper;
