'use strict';

/**
 * Minimal SFCC runtime for unit tests: maps `dw/*` requires to fakes and
 * `*\/cartridge/*` requires to int_checkoutcom_next, and provides factories for
 * the baskets, orders and payment instruments the checkout scripts work with.
 */

const Module = require('module');
const path = require('path');

const CARTRIDGE = path.resolve(__dirname, '../../../cartridges/int_checkoutcom_next/cartridge');

const mocks = new Map();
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolve(request, parent, ...rest) {
    if (request.startsWith('*/cartridge/')) {
        return originalResolve.call(this, path.join(CARTRIDGE, request.slice('*/cartridge/'.length)), parent, ...rest);
    }

    return originalResolve.call(this, request, parent, ...rest);
};

Module._load = function load(request, parent, isMain) {
    if (request.startsWith('dw/')) {
        if (!mocks.has(request)) {
            throw new Error(`No mock registered for ${request}`);
        }

        return mocks.get(request);
    }

    return originalLoad.call(this, request, parent, isMain);
};

/** Money with the subset of dw.value.Money the scripts use. */
class Money {
    constructor(value, currencyCode) {
        this.value = value;
        this.currencyCode = currencyCode;
    }

    getValue() {
        return this.value;
    }

    getCurrencyCode() {
        return this.currencyCode;
    }

    isAvailable() {
        return true;
    }
}

const ORDER = {
    ORDER_STATUS_CREATED: 0,
    ORDER_STATUS_NEW: 3,
    ORDER_STATUS_OPEN: 4,
    ORDER_STATUS_COMPLETED: 5,
    ORDER_STATUS_FAILED: 8,
    PAYMENT_STATUS_NOTPAID: 0,
    PAYMENT_STATUS_PARTPAID: 1,
    PAYMENT_STATUS_PAID: 2,
    CONFIRMATION_STATUS_NOTCONFIRMED: 0,
    CONFIRMATION_STATUS_CONFIRMED: 2,
    EXPORT_STATUS_READY: 2,
};

/** @returns {Object} An iterable SFCC collection over an array */
function collection(items) {
    return {
        toArray: () => items.slice(),
        size: () => items.length,
        isEmpty: () => items.length === 0,
        iterator: () => {
            let index = 0;

            return { hasNext: () => index < items.length, next: () => items[index++] };
        },
    };
}

/** @returns {Object} A payment instrument with a transaction */
function makeInstrument(methodId, amount) {
    const transaction = {
        custom: {},
        amount,
        setTransactionID(id) { this.transactionID = id; },
        getTransactionID() { return this.transactionID || null; },
        setPaymentProcessor(processor) { this.paymentProcessor = processor; },
        setType(type) { this.type = type; },
        setAmount(value) { this.amount = value; },
        getAmount() { return this.amount; },
    };

    return { methodId, getPaymentMethod: () => methodId, getPaymentTransaction: () => transaction };
}

/** @returns {Object} An order address */
function makeAddress(overrides = {}) {
    const values = {
        address1: '1 Main St', address2: null, city: 'London', stateCode: null, postalCode: 'N1 1AA',
        countryCode: 'gb', phone: null, fullName: 'Jordan Smith', ...overrides,
    };

    return {
        getAddress1: () => values.address1,
        getAddress2: () => values.address2,
        getCity: () => values.city,
        getStateCode: () => values.stateCode,
        getPostalCode: () => values.postalCode,
        getCountryCode: () => (values.countryCode ? { getValue: () => values.countryCode } : null),
        getPhone: () => values.phone,
        getFullName: () => values.fullName,
    };
}

/**
 * A basket or order (dw.order.LineItemCtnr subset).
 * @param {Object} options currency, lines [{ id, name, qty, total, base, prorated, options }], giftCertificates,
 *   shipping, shippingBase, tax, orderNo, status, customerId. A line's base is its price before promotions, total
 *   after product promotions and prorated after order promotions too; options are [{ id, valueId, text, qty, base, prorated }].
 */
function makeContainer(options = {}) {
    const currency = options.currency || 'GBP';
    const definitions = options.lines || [{ id: 'P1', name: 'Shirt', qty: 2, total: 40 }];
    const lines = definitions.map((line) => ({
        getProductID: () => line.id,
        getProductName: () => line.name,
        getQuantityValue: () => line.qty,
        getPrice: () => new Money(line.base ?? line.total, currency),
        getAdjustedPrice: () => new Money(line.total, currency),
        getProratedPrice: () => new Money(line.prorated ?? line.total, currency),
        getOptionProductLineItems: () => collection((line.options || []).map((option) => ({
            getOptionID: () => option.id,
            getOptionValueID: () => option.valueId,
            getLineItemText: () => option.text,
            getQuantityValue: () => option.qty ?? line.qty,
            getPrice: () => new Money(option.base, currency),
            getProratedPrice: () => new Money(option.prorated ?? option.base, currency),
        }))),
    }));
    const giftCertificates = (options.giftCertificates || []).map((amount, index) => ({
        getUUID: () => `gc-${index + 1}`,
        getPrice: () => new Money(amount, currency),
    }));
    const shipping = options.shipping === undefined ? 5 : options.shipping;
    const tax = options.tax || 0;
    const merchandise = definitions.reduce((sum, line) => sum + (line.prorated ?? line.total)
        + (line.options || []).reduce((optionSum, option) => optionSum + (option.prorated ?? option.base), 0), 0);
    const total = merchandise + giftCertificates.reduce((sum, item) => sum + item.getPrice().getValue(), 0) + shipping + (options.netTax ? tax : 0);
    const instruments = Array.from({ length: options.instruments || 1 }, () => makeInstrument('CHECKOUTCOM_FLOW', new Money(total, currency)));
    const customerId = options.customerId || 'cust-1';

    const container = {
        custom: {},
        notes: [],
        status: options.status === undefined ? ORDER.ORDER_STATUS_CREATED : options.status,
        paymentStatus: ORDER.PAYMENT_STATUS_NOTPAID,
        getUUID: () => options.uuid || 'basket-1',
        getOrderNo: () => options.orderNo || '00001',
        getOrderToken: () => options.orderToken || `token-${options.orderNo || '00001'}`,
        getCurrencyCode: () => currency,
        getProductLineItems: () => collection(lines),
        getGiftCertificateLineItems: () => collection(giftCertificates),
        getShippingTotalPrice: () => new Money(options.shippingBase ?? shipping, currency),
        getAdjustedShippingTotalPrice: () => new Money(shipping, currency),
        getTotalTax: () => new Money(tax, currency),
        getTotalGrossPrice: () => new Money(total, currency),
        getBillingAddress: () => (options.noAddress ? null : makeAddress(options.billing)),
        getDefaultShipment: () => ({ getShippingAddress: () => (options.noAddress ? null : makeAddress()) }),
        getCustomerEmail: () => 'jordan@example.com',
        getCustomer: () => ({ getID: () => customerId, isRegistered: () => false, getProfile: () => null }),
        getStatus() { return { getValue: () => this.status }; },
        getPaymentStatus() { return { getValue: () => this.paymentStatus }; },
        setPaymentStatus(status) { this.paymentStatus = status; },
        setConfirmationStatus(status) { this.confirmationStatus = status; },
        setExportStatus(status) { this.exportStatus = status; },
        addNote(subject, text) { this.notes.push(text); },
        getPaymentInstruments: (methodId) => collection(methodId ? instruments.filter((i) => i.methodId === methodId) : instruments),
        removePaymentInstrument: (instrument) => {
            instruments.splice(instruments.indexOf(instrument), 1);
        },
        createPaymentInstrument: (methodId, amount) => {
            const instrument = makeInstrument(methodId, amount);

            instruments.push(instrument);

            return instrument;
        },
        instruments,
    };

    return container;
}

/**
 * Register the default dw fakes, override some, and load a cartridge module fresh.
 * @param {string} modulePath Path relative to the cartridge, e.g. scripts/checkoutcom/checkout
 * @param {Object} overrides dw module fakes to replace
 * @returns {Object} The loaded module
 */
function load(modulePath, overrides = {}) {
    const preferences = overrides.preferences || {};

    mocks.clear();

    const defaults = {
        'dw/system/Site': { getCurrent: () => ({ getName: () => 'Test Site', getCustomPreferenceValue: (id) => preferences[id] ?? null }) },
        'dw/system/Logger': { getLogger: () => ({ error() {}, warn() {}, info() {} }) },
        'dw/system/Transaction': { wrap: (fn) => fn() },
        'dw/util/Currency': { getCurrency: (code) => ({ getDefaultFractionDigits: () => (code === 'JPY' ? 0 : 2) }) },
        'dw/value/Money': Money,
        'dw/order/TaxMgr': { TAX_POLICY_NET: 1, TAX_POLICY_GROSS: 0, getTaxationPolicy: () => overrides.taxPolicy ?? 0 },
        'dw/order/Order': ORDER,
        'dw/order/PaymentMgr': { getPaymentMethod: () => ({ isActive: () => overrides.flowActive !== false, getPaymentProcessor: () => ({ getID: () => 'CHECKOUTCOM_FLOW' }) }) },
        'dw/order/PaymentTransaction': { TYPE_AUTH: 'AUTH', TYPE_CAPTURE: 'CAPTURE', TYPE_CREDIT: 'CREDIT', TYPE_AUTH_REVERSAL: 'AUTH_REVERSAL' },
        'dw/order/BasketMgr': { getCurrentBasket: () => null },
        'dw/order/OrderMgr': { getOrder: () => null },
        'dw/object/CustomObjectMgr': { getCustomObject: () => null, createCustomObject: () => ({ custom: {} }) },
        'dw/svc/LocalServiceRegistry': { createService: () => { throw new Error('gateway not mocked'); } },
        'dw/crypto/Mac': class {},
        'dw/crypto/Encoding': {},
    };

    Object.entries({ ...defaults, ...overrides }).forEach(([key, value]) => {
        if (key.startsWith('dw/')) {
            mocks.set(key, value);
        }
    });

    Object.keys(require.cache).forEach((file) => {
        if (file.startsWith(CARTRIDGE)) {
            delete require.cache[file];
        }
    });

    // The cartridge's own modules can be replaced too (e.g. the gateway)
    Object.entries(overrides).forEach(([key, value]) => {
        if (key.startsWith('*/cartridge/')) {
            const file = require.resolve(key);

            require.cache[file] = { id: file, filename: file, loaded: true, exports: value };
        }
    });

    return require(path.join(CARTRIDGE, modulePath));
}

/**
 * A Shopper Baskets (SCAPI) basket, as the storefront sends it.
 * @param {Object} options basketId, currency, items [{ productId, productName, quantity, priceAfterItemDiscount }], shippingTotal, taxTotal, taxation, orderTotal
 */
function makeScapiBasket(options = {}) {
    const items = options.items || [{ productId: 'P1', productName: 'Shirt', quantity: 2, priceAfterItemDiscount: 40 }];
    const shippingTotal = options.shippingTotal === undefined ? 5 : options.shippingTotal;
    const taxTotal = options.taxTotal || 0;
    const computed = items.reduce((sum, item) => sum + (item.priceAfterOrderDiscount ?? item.priceAfterItemDiscount), 0)
        + shippingTotal + (options.taxation === 'net' ? taxTotal : 0);
    const address = { firstName: 'Jordan', lastName: 'Smith', address1: '1 Main St', address2: null, city: 'London', postalCode: 'N1 1AA', countryCode: 'gb', stateCode: null, phone: null };

    return {
        basketId: options.basketId || 'basket-1',
        currency: options.currency || 'GBP',
        orderTotal: options.orderTotal === undefined ? computed : options.orderTotal,
        productItems: items,
        shippingTotal,
        shippingItems: options.shippingItems,
        taxTotal,
        taxation: options.taxation || 'gross',
        customerInfo: { email: 'jordan@example.com' },
        billingAddress: options.noAddress ? null : address,
        shipments: [{ shippingAddress: options.noAddress ? null : address }],
    };
}

/** An in-memory dw.object.CustomObjectMgr; `objects` holds { 'type/key': object }. */
function customObjects() {
    const objects = {};

    return {
        objects,
        getCustomObject: (type, key) => objects[`${type}/${key}`] || null,
        createCustomObject: (type, key) => {
            objects[`${type}/${key}`] = { custom: {} };

            return objects[`${type}/${key}`];
        },
    };
}

/**
 * A dw.order.OrderMgr over a set of orders. Like a storefront request with
 * Limit Storefront Order Access enabled, getOrder(no, token) needs the token.
 */
function orderManager(ordersByNo, extra = {}) {
    return {
        getOrder: (no, token) => {
            const order = ordersByNo[no] || null;

            if (order && token !== undefined && token !== order.getOrderToken()) {
                return null;
            }

            return order;
        },
        searchOrders: () => {
            throw new Error('searchOrders is restricted in storefront requests');
        },
        ...extra,
    };
}

module.exports = { load, makeContainer, makeScapiBasket, makeAddress, customObjects, orderManager, Money, ORDER };
