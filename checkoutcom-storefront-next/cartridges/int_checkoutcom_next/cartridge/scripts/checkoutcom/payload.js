'use strict';

var Currency = require('dw/util/Currency');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var TaxMgr = require('dw/order/TaxMgr');

var config = require('*/cartridge/scripts/checkoutcom/config');

/**
 * Builds the Checkout.com request bodies.
 *
 *  - The payment session is built from the SCAPI basket the storefront sends
 *    (Shopper Baskets JSON). A Custom API script cannot load the shopper's basket
 *    itself: BasketMgr.getBasket()/getBaskets() are agent-only APIs and
 *    getCurrentBasket() must not be used in REST contexts. Trusting this input is
 *    safe because the session only shapes what Flow displays: the amount charged
 *    is set at submission, from the order (buildSubmitRequest), and completion
 *    verifies the payment against that order.
 *  - The submission is built from the dw.order.Order created through SCAPI.
 *
 * The rules below were learned against /payment-sessions in production on the
 * SFRA integration and must be kept:
 *  - null or empty optional fields are rejected rather than ignored, so every
 *    request goes through pruneEmpty();
 *  - the items must add up to the amount, so shipping and (net taxation) tax
 *    are separate items; Buy Now Pay Later methods require this;
 *  - only risk.enabled is accepted; Flow collects the device data itself;
 *  - phone numbers are sent as a bare { number } (a null country code is rejected).
 */

/**
 * Convert a money value to the gateway's minor units.
 * @param {dw.value.Money} money The amount
 * @returns {number} The amount in minor units (0 when not available)
 */
function toMinorUnits(money) {
    if (!money || !money.isAvailable()) {
        return 0;
    }

    var digits = Currency.getCurrency(money.getCurrencyCode()).getDefaultFractionDigits();

    return Math.round(money.getValue() * Math.pow(10, digits));
}

/**
 * Convert a decimal amount to the gateway's minor units.
 * @param {number} value The amount
 * @param {string} currencyCode The currency
 * @returns {number} The amount in minor units
 */
function numberToMinorUnits(value, currencyCode) {
    var digits = Currency.getCurrency(currencyCode).getDefaultFractionDigits();

    return Math.round(Number(value) * Math.pow(10, digits));
}

/**
 * Keep the items only when they add up to the amount. With prorated prices they
 * do, promotions included; should a rounding or an unknown line item still make
 * them differ, it is better to send none than to have the gateway reject the
 * payment (only Buy Now Pay Later methods need them).
 * @param {Array<Object>} items The items
 * @param {number} amount The amount in minor units
 * @returns {Array<Object>|undefined} The items, or undefined
 */
function balancedItems(items, amount) {
    var sum = items.reduce(function(total, item) {
        return total + item.total_amount;
    }, 0);

    if (sum !== amount) {
        Logger.getLogger(config.LOG_CATEGORY).warn('Items left out: they add up to {0}, the amount is {1}.', sum, amount);

        return undefined;
    }

    return items;
}

/**
 * Project a SCAPI address onto the gateway address shape.
 * @param {Object} address A Shopper Baskets OrderAddress
 * @returns {Object|null} The gateway address
 */
function fromScapiAddress(address) {
    if (!address) {
        return null;
    }

    return {
        address_line1: address.address1,
        address_line2: address.address2,
        city: address.city,
        state: address.stateCode,
        zip: address.postalCode,
        country: address.countryCode ? String(address.countryCode).toUpperCase() : null,
    };
}

/**
 * Project an order address (dw.order.OrderAddress) onto the gateway address shape.
 * @param {dw.order.OrderAddress} address The address
 * @returns {Object|null} The gateway address
 */
function fromOrderAddress(address) {
    if (!address) {
        return null;
    }

    return {
        address_line1: address.getAddress1(),
        address_line2: address.getAddress2(),
        city: address.getCity(),
        state: address.getStateCode(),
        zip: address.getPostalCode(),
        country: address.getCountryCode() ? String(address.getCountryCode().getValue()).toUpperCase() : null,
    };
}

/**
 * Recursively drop null, undefined and empty string values. Booleans and
 * numbers are kept, so capture: false survives.
 * @param {*} value The value to clean
 * @returns {*} The cleaned value, or undefined when nothing is left
 */
function pruneEmpty(value) {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    if (Array.isArray(value)) {
        var list = value.map(pruneEmpty).filter(function(item) {
            return item !== undefined;
        });

        return list.length > 0 ? list : undefined;
    }

    if (typeof value === 'object') {
        var cleaned = {};
        var kept = false;

        Object.keys(value).forEach(function(key) {
            var pruned = pruneEmpty(value[key]);

            if (pruned !== undefined) {
                cleaned[key] = pruned;
                kept = true;
            }
        });

        return kept ? cleaned : undefined;
    }

    return value;
}

/**
 * One Checkout.com item. The unit price is the price before promotions and the
 * discount_amount holds every product, order and shipping promotion applied to
 * the line, so quantity x unit_price - discount_amount = total_amount (the
 * convention Klarna and the other Buy Now Pay Later methods validate).
 * @param {Object} line name, reference, type, quantity, base (before promotions) and total (after), in minor units
 * @returns {Object} The item
 */
function toItem(line) {
    var quantity = line.quantity > 0 ? line.quantity : 1;
    // Rounded up so a total that does not divide by the quantity never gives a negative discount
    var unitPrice = Math.ceil(Math.max(line.base, line.total) / quantity);
    var discount = (unitPrice * quantity) - line.total;
    var item = {
        name: line.name,
        quantity: quantity,
        unit_price: unitPrice,
        total_amount: line.total,
        reference: line.reference,
        type: line.type,
    };

    if (discount > 0) {
        item.discount_amount = discount;
    }

    return item;
}

/**
 * Build the session items from a SCAPI basket: products and their options,
 * gift certificates, shipping and (net taxation) tax, so they add up to the
 * order total. Product prices are the ones after order discounts
 * (priceAfterOrderDiscount: SFCC prorates order promotions and coupons over the
 * products); shippingTotal is already after shipping promotions.
 * @param {Object} basket The Shopper Baskets basket
 * @returns {Array<Object>} The items
 */
function getScapiItems(basket) {
    var currency = basket.currency;
    var items = [];

    /**
     * @param {Object} item A product or option item
     * @returns {number} Its price after every promotion, in minor units
     */
    function finalPrice(item) {
        var value = [item.priceAfterOrderDiscount, item.priceAfterItemDiscount, item.price].filter(function(price) {
            return typeof price === 'number';
        })[0];

        return numberToMinorUnits(value || 0, currency);
    }

    (basket.productItems || []).forEach(function(item) {
        var total = finalPrice(item);

        items.push(toItem({
            name: item.productName || item.itemText || item.productId,
            reference: item.productId,
            type: 'physical',
            quantity: item.quantity || 1,
            base: typeof item.price === 'number' ? numberToMinorUnits(item.price, currency) : total,
            total: total,
        }));

        (item.optionItems || []).forEach(function(option) {
            var optionTotal = finalPrice(option);

            if (optionTotal > 0 || option.price > 0) {
                items.push(toItem({
                    name: option.itemText || option.optionValueId || option.optionId,
                    reference: option.optionId + (option.optionValueId ? '-' + option.optionValueId : ''),
                    type: 'physical',
                    quantity: option.quantity || item.quantity || 1,
                    base: typeof option.price === 'number' ? numberToMinorUnits(option.price, currency) : optionTotal,
                    total: optionTotal,
                }));
            }
        });
    });

    (basket.giftCertificateItems || []).forEach(function(item) {
        var amount = numberToMinorUnits(item.price || 0, currency);

        items.push(toItem({ name: 'Gift Certificate', reference: item.giftCertificateItemId || 'gift_certificate', type: 'digital', quantity: 1, base: amount, total: amount }));
    });

    var shippingBase = (basket.shippingItems || []).reduce(function(sum, item) {
        return sum + (typeof item.price === 'number' ? item.price : 0);
    }, 0);
    var shippingTotal = basket.shippingTotal || 0;

    // A free shipping promotion still shows as a shipping line, fully discounted
    if (shippingTotal > 0 || shippingBase > 0) {
        items.push(toItem({
            name: 'Shipping',
            reference: 'shipping',
            type: 'shipping_fee',
            quantity: 1,
            base: numberToMinorUnits(shippingBase, currency),
            total: numberToMinorUnits(shippingTotal, currency),
        }));
    }

    if (basket.taxation === 'net' && basket.taxTotal > 0) {
        var tax = numberToMinorUnits(basket.taxTotal, currency);

        items.push(toItem({ name: 'Tax', reference: 'tax', type: 'tax', quantity: 1, base: tax, total: tax }));
    }

    return items;
}

/**
 * Build the items of a basket or order: products and their options, gift
 * certificates, shipping and (net taxation) tax. Product prices are prorated
 * (getProratedPrice: after product and order promotions and coupons, which SFCC
 * spreads over the products) so the items add up to the order total; shipping
 * is after shipping promotions.
 * @param {dw.order.LineItemCtnr} lineItemCtnr The basket or order
 * @returns {Array<Object>} The items
 */
function getItems(lineItemCtnr) {
    var items = [];
    var lineItems = lineItemCtnr.getProductLineItems().iterator();

    while (lineItems.hasNext()) {
        var lineItem = lineItems.next();

        items.push(toItem({
            name: lineItem.getProductName(),
            reference: lineItem.getProductID(),
            type: 'physical',
            quantity: lineItem.getQuantityValue(),
            base: toMinorUnits(lineItem.getPrice()),
            total: toMinorUnits(lineItem.getProratedPrice()),
        }));

        // Options are line items of their own: getProductLineItems() leaves them out
        var options = lineItem.getOptionProductLineItems ? lineItem.getOptionProductLineItems().iterator() : null;

        while (options && options.hasNext()) {
            var option = options.next();
            var optionBase = toMinorUnits(option.getPrice());
            var optionTotal = toMinorUnits(option.getProratedPrice());

            if (optionBase > 0 || optionTotal > 0) {
                items.push(toItem({
                    name: option.getLineItemText(),
                    reference: option.getOptionID() + '-' + option.getOptionValueID(),
                    type: 'physical',
                    quantity: option.getQuantityValue(),
                    base: optionBase,
                    total: optionTotal,
                }));
            }
        }
    }

    var giftCertificates = lineItemCtnr.getGiftCertificateLineItems ? lineItemCtnr.getGiftCertificateLineItems().iterator() : null;

    while (giftCertificates && giftCertificates.hasNext()) {
        var giftCertificate = giftCertificates.next();
        var amount = toMinorUnits(giftCertificate.getPrice());

        items.push(toItem({ name: 'Gift Certificate', reference: giftCertificate.getUUID(), type: 'digital', quantity: 1, base: amount, total: amount }));
    }

    var shippingBase = toMinorUnits(lineItemCtnr.getShippingTotalPrice());
    var shippingTotal = toMinorUnits(lineItemCtnr.getAdjustedShippingTotalPrice());

    // A free shipping promotion still shows as a shipping line, fully discounted
    if (shippingTotal > 0 || shippingBase > 0) {
        items.push(toItem({ name: 'Shipping', reference: 'shipping', type: 'shipping_fee', quantity: 1, base: shippingBase, total: shippingTotal }));
    }

    // Under gross taxation the tax is already inside the item prices
    if (TaxMgr.getTaxationPolicy() === TaxMgr.TAX_POLICY_NET) {
        var tax = toMinorUnits(lineItemCtnr.getTotalTax());

        if (tax > 0) {
            items.push(toItem({ name: 'Tax', reference: 'tax', type: 'tax', quantity: 1, base: tax, total: tax }));
        }
    }

    return items;
}

/**
 * @param {dw.order.LineItemCtnr} lineItemCtnr The basket or order
 * @returns {dw.value.Money} The amount to charge
 */
function getTotal(lineItemCtnr) {
    return lineItemCtnr.getTotalGrossPrice();
}

/* global customer */

module.exports = {
    toMinorUnits: toMinorUnits,
    numberToMinorUnits: numberToMinorUnits,
    pruneEmpty: pruneEmpty,
    getItems: getItems,
    getTotal: getTotal,

    /**
     * Build the POST /payment-sessions request from the SCAPI basket the
     * storefront sends. The reference is the basket id for now: the payment is
     * submitted with the order number as its reference once the order exists.
     * @param {Object} basket The Shopper Baskets basket (basketId, currency, orderTotal, productItems, ...)
     * @param {Object} options successUrl, failureUrl and locale
     * @returns {Object} The request body
     */
    buildSessionRequest: function(basket, options) {
        var shipment = (basket.shipments || [])[0];
        var shippingAddress = shipment ? shipment.shippingAddress : null;
        var billingAddress = basket.billingAddress || shippingAddress;
        var phone = billingAddress && billingAddress.phone ? { number: billingAddress.phone } : null;
        var amount = numberToMinorUnits(basket.orderTotal, basket.currency);
        var registered = typeof customer !== 'undefined' && customer && customer.isRegistered();
        var email = basket.customerInfo ? basket.customerInfo.email : null;

        var request = {
            amount: amount,
            currency: basket.currency,
            reference: basket.basketId,
            display_name: Site.getCurrent().getName(),
            locale: options.locale,
            payment_type: 'Regular',
            capture: config.isCaptureEnabled(),
            customer: {
                email: email,
                name: billingAddress ? billingAddress.fullName || [billingAddress.firstName, billingAddress.lastName].join(' ').trim() : null,
                phone: phone,
            },
            billing: {
                address: fromScapiAddress(billingAddress),
                phone: phone,
            },
            shipping: shippingAddress ? { address: fromScapiAddress(shippingAddress), phone: phone } : null,
            items: balancedItems(getScapiItems(basket), amount),
            risk: { enabled: config.isRiskEnabled() },
            '3ds': config.getThreeDS(),
            processing_channel_id: config.getValue(config.PREFERENCES.PROCESSING_CHANNEL_ID),
            success_url: options.successUrl,
            failure_url: options.failureUrl,
            metadata: {
                basket_id: basket.basketId,
                integration: 'sfcc_storefront_next',
                platform_data: config.PLATFORM_DATA,
                payment_processor: config.PAYMENT_METHOD_ID,
            },
        };

        var methods = config.getList(config.PREFERENCES.PAYMENT_METHODS);

        if (methods.length > 0) {
            request.enabled_payment_methods = methods;
        }

        // Shows the card's "save card details" checkbox, only to identifiable,
        // registered shoppers. Not related to Checkout.com Remember Me, which is
        // switched on and off on the Checkout.com account.
        if (registered && email && config.getValue(config.PREFERENCES.SAVE_PAYMENT_DETAILS) === true) {
            request.payment_method_configuration = { card: { store_payment_details: 'collect_consent' } };
        }

        return pruneEmpty(request);
    },

    /**
     * Build the POST /payment-sessions/{id}/submit request for an order: the
     * Flow session data plus what is final only once the order exists: amount,
     * items, the order number as reference (so webhooks and the BM console
     * resolve the order directly), and the billing address, shipping address and
     * customer.
     *
     * The payment session was created at the payment step, before the shopper
     * could tick "Use a different billing address". The checkout saves that
     * address to the basket before Place Order reaches the payment, so the order
     * carries it; submitting it here updates the existing session, without
     * re-creating it and without losing the card details typed into Flow.
     * @param {dw.order.Order} order The order
     * @param {string} sessionData The session_data from Flow's handleSubmit
     * @returns {Object} The request body
     */
    buildSubmitRequest: function(order, sessionData) {
        var amount = toMinorUnits(getTotal(order));
        var billingAddress = order.getBillingAddress();
        var shipment = order.getDefaultShipment();
        var shippingAddress = shipment ? shipment.getShippingAddress() : null;
        var phone = billingAddress && billingAddress.getPhone() ? { number: billingAddress.getPhone() } : null;

        return pruneEmpty({
            session_data: sessionData,
            amount: amount,
            reference: order.getOrderNo(),
            items: balancedItems(getItems(order), amount),
            billing: { address: fromOrderAddress(billingAddress), phone: phone },
            shipping: shippingAddress ? { address: fromOrderAddress(shippingAddress), phone: phone } : null,
            customer: {
                email: order.getCustomerEmail(),
                name: billingAddress ? billingAddress.getFullName() : null,
                phone: phone,
            },
        });
    },
};
