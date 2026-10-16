'use strict';

/* API Includes */
var Logger = require('dw/system/Logger');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var TaxMgr = require('dw/order/TaxMgr');
var URLUtils = require('dw/web/URLUtils');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/* Configuration */
var constants = require('*/cartridge/config/constants');
var flowConfig = require('*/cartridge/config/ckoFlowConfig');

/* Services */
var flowSessions = require('*/cartridge/scripts/services/flowSessions');

/**
 * Checkout.com Flow helper.
 *
 * Builds and submits the payment session that the Checkout Web Components (Flow)
 * bundle renders on the storefront, and reads payments back from the gateway so
 * the SFRA order can be settled once the shopper has paid.
 *
 * This helper only ever reads from ckoHelper; it does not extend or replace it,
 * which keeps the card / APM / SiteGenesis integrations untouched.
 */
var flowHelper = {
    /**
     * Check whether the Flow component is switched on for the current site.
     * @returns {boolean} True when Flow is enabled
     */
    isEnabled: function() {
        return ckoHelper.getValue(flowConfig.CKO_FLOW_ENABLED) === true;
    },

    /**
     * Resolve the Checkout Web Components environment from the cartridge mode.
     * @returns {string} Either "sandbox" or "production"
     */
    getEnvironment: function() {
        return ckoHelper.getValue(constants.CKO_MODE) === 'live'
            ? flowConfig.ENVIRONMENT_PRODUCTION
            : flowConfig.ENVIRONMENT_SANDBOX;
    },

    /**
     * Get the public key the storefront uses to initialise Flow.
     * @returns {string} The ABC or NAS public key for the current mode
     */
    getPublicKey: function() {
        return ckoHelper.getAccountKeys().publicKey;
    },

    /**
     * Get the locale Flow should render in, as a BCP 47 tag.
     * @returns {string} The locale, for example "en-GB"
     */
    getLocale: function() {
        return ckoHelper.getLanguage();
    },

    /**
     * Get the optional appearance overrides configured in Business Manager.
     * Invalid JSON is logged and ignored so a bad value never breaks checkout.
     * @returns {Object|null} The parsed appearance object, or null
     */
    getAppearance: function() {
        var appearance = ckoHelper.getValue(flowConfig.CKO_FLOW_APPEARANCE);

        if (!appearance) {
            return null;
        }

        try {
            return JSON.parse(appearance);
        } catch (e) {
            Logger.getLogger('checkoutcom').warn(
                'Invalid Flow appearance JSON configured; Flow default styling will be used.'
            );

            return null;
        }
    },

    /**
     * Get the payment methods Flow is allowed to offer.
     * An empty preference lets the gateway decide, which is the recommended setup.
     * @returns {Array|null} The list of payment method identifiers, or null
     */
    getEnabledPaymentMethods: function() {
        var configured = ckoHelper.getValue(flowConfig.CKO_FLOW_PAYMENT_METHODS);

        if (!configured) {
            return null;
        }

        var methods = configured.split(',').map(function(method) {
            return method.trim();
        }).filter(function(method) {
            return method.length > 0;
        });

        return methods.length > 0 ? methods : null;
    },

    /**
     * Check whether Flow payments should be captured automatically.
     * Falls back to the cartridge wide auto capture preference.
     * @returns {boolean} True when the payment should be captured
     */
    isCaptureEnabled: function() {
        var flowCapture = ckoHelper.getValue(flowConfig.CKO_FLOW_CAPTURE);

        if (flowCapture === null || flowCapture === undefined) {
            return ckoHelper.getValue(constants.CKO_AUTO_CAPTURE) === true;
        }

        return flowCapture === true;
    },

    /**
     * Check whether Flow may offer to store the shopper's payment details.
     * @returns {boolean} True when the "save payment details" toggle is shown
     */
    isSavePaymentDetailsEnabled: function() {
        return ckoHelper.getValue(flowConfig.CKO_FLOW_SAVE_PAYMENT_DETAILS) === true;
    },

    /**
     * Build the line items sent with the payment session.
     * Buy Now Pay Later methods rendered by Flow require them to reconcile the
     * basket, so shipping and tax are added as their own items to keep the sum
     * of the items equal to the session amount. The name/quantity/unit_price/
     * total_amount/reference/type shape matches the one the Sequra and Tabby
     * helpers already send to the gateway.
     * @param {dw.order.Order} order The order instance
     * @returns {Array} The list of items
     */
    getItems: function(order) {
        var currency = order.getCurrencyCode();
        var items = [];
        var iterator = order.getProductLineItems().iterator();

        while (iterator.hasNext()) {
            var lineItem = iterator.next();
            var quantity = lineItem.getQuantityValue();
            var totalAmount = parseInt(
                ckoHelper.getFormattedPrice(lineItem.getAdjustedPrice().getValue().toFixed(2), currency),
                10
            );

            items.push({
                name: lineItem.getProductName(),
                quantity: quantity,
                unit_price: quantity > 0 ? Math.round(totalAmount / quantity) : totalAmount,
                total_amount: totalAmount,
                reference: lineItem.getProductID(),
                type: 'physical',
            });
        }

        // Shipping is a separate item so the items add up to the session amount
        var shippingTotal = order.getAdjustedShippingTotalPrice();
        if (shippingTotal && shippingTotal.available && shippingTotal.getValue() > 0) {
            var shippingAmount = parseInt(
                ckoHelper.getFormattedPrice(shippingTotal.getValue().toFixed(2), currency),
                10
            );

            items.push({
                name: Resource.msg('cko.flow.item.shipping', 'cko', null),
                quantity: 1,
                unit_price: shippingAmount,
                total_amount: shippingAmount,
                reference: 'shipping',
                type: 'shipping_fee',
            });
        }

        // Under a gross taxation policy the tax is already part of the item
        // prices, so it is only added as its own item for net taxation.
        var totalTax = order.getTotalTax();
        var isNetTaxation = TaxMgr.getTaxationPolicy() === TaxMgr.TAX_POLICY_NET;
        if (isNetTaxation && totalTax && totalTax.available && totalTax.getValue() > 0) {
            var taxAmount = parseInt(
                ckoHelper.getFormattedPrice(totalTax.getValue().toFixed(2), currency),
                10
            );

            items.push({
                name: Resource.msg('cko.flow.item.tax', 'cko', null),
                quantity: 1,
                unit_price: taxAmount,
                total_amount: taxAmount,
                reference: 'tax',
                type: 'tax',
            });
        }

        return items;
    },

    /**
     * Recursively drop null, undefined and empty string values from a request.
     *
     * SFCC returns null for optional address fields that the shopper left blank
     * (address2, stateCode for countries without states, the phone country code),
     * and the payment sessions API rejects those keys outright rather than
     * ignoring them — a blank address line 2 comes back as
     * "billing_address_address_line2_invalid". Booleans and numbers are kept, so
     * capture: false and risk.enabled: false survive untouched.
     * @param {*} value The value to clean
     * @returns {*} The cleaned value, or undefined when nothing is left
     */
    pruneEmpty: function(value) {
        if (value === null || value === undefined || value === '') {
            return undefined;
        }

        if (value instanceof Array) {
            var list = [];
            for (var i = 0; i < value.length; i += 1) {
                var item = this.pruneEmpty(value[i]);
                if (item !== undefined) {
                    list.push(item);
                }
            }

            return list.length > 0 ? list : undefined;
        }

        if (typeof value === 'object') {
            var cleaned = {};
            var kept = false;

            Object.keys(value).forEach(function(key) {
                var pruned = this.pruneEmpty(value[key]);
                if (pruned !== undefined) {
                    cleaned[key] = pruned;
                    kept = true;
                }
            }, this);

            return kept ? cleaned : undefined;
        }

        return value;
    },

    /**
     * Build the POST /payment-sessions request body for an order.
     * @param {dw.order.Order} order The order instance
     * @returns {Object} The payment session request data
     */
    getSessionRequest: function(order) {
        var billingAddress = order.getBillingAddress();

        // Mirror cardHelper.buildRequest(): the customer is the shared
        // ckoHelper.getCustomer() object, and the phone is attached as a bare
        // { number } only when the order actually carries one. The direct
        // integration deliberately does not use ckoHelper.getPhone() here
        // because that helper hardcodes country_code: null, which this endpoint
        // rejects with "*_phone_country_code_invalid".
        var customer = ckoHelper.getCustomer(order);
        var phone = null;

        if (billingAddress && billingAddress.getPhone()) {
            phone = { number: billingAddress.getPhone() };
            customer.phone = phone;
        }

        var requestData = {
            amount: parseInt(ckoHelper.getAmount(order), 10),
            currency: order.getCurrencyCode(),
            reference: order.getOrderNo(),
            display_name: ckoHelper.getValue(constants.CKO_BUSINESS_NAME) || ckoHelper.getSiteName(),
            locale: this.getLocale(),
            payment_type: 'Regular',
            billing_descriptor: ckoHelper.getBillingDescriptor(),
            capture: this.isCaptureEnabled(),
            customer: customer,
            // Same address projection the direct integration sends as
            // source.billing_address, which is why it carries no state field.
            billing: {
                address: billingAddress ? ckoHelper.getFormattedBillingAddress(billingAddress) : null,
                phone: phone,
            },
            items: this.getItems(order),
            metadata: ckoHelper.getMetadata({}, flowConfig.PAYMENT_PROCESSOR_ID),
            // Only "enabled" is sent. The Flow component gathers the device and
            // network signals itself on the storefront, so the server has nothing
            // to contribute: the device block that cardHelper/apmHelper send to
            // /payments is both unnecessary here and rejected by this endpoint
            // ("risk_device_invalid"). The same applies to risk.device_session_id,
            // which the Risk.js integration supplies for the direct card flow.
            risk: {
                enabled: ckoHelper.getValue(constants.CKO_ENABLE_RISK_FLAG) === true,
            },
            '3ds': ckoHelper.get3Ds(),
            success_url: URLUtils.https('CKOFlow-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOFlow-HandleFail').toString(),
        };

        // The shipment is optional: digital only baskets have no shipping address.
        // ckoHelper.getShipping() is the same projection the direct integration
        // sends, except that its phone is rebuilt without the null country code.
        if (order.getDefaultShipment() && order.getDefaultShipment().getShippingAddress()) {
            var shipping = ckoHelper.getShipping(order);
            shipping.phone = phone;
            requestData.shipping = shipping;
        }

        // Delayed capture is expressed as an absolute timestamp
        if (requestData.capture && ckoHelper.getValue(constants.CKO_AUTO_CAPTURE_TIME) > 0) {
            requestData.capture_on = ckoHelper.getCaptureTime();
        }

        // Mandatory on NAS accounts, rejected on ABC accounts when empty
        var processingChannelId = ckoHelper.getValue(constants.CKO_PROCESSING_CHANNEL_ID);
        if (processingChannelId) {
            requestData.processing_channel_id = processingChannelId;
        }

        // Restricting the methods is optional; by default the gateway decides
        var enabledPaymentMethods = this.getEnabledPaymentMethods();
        if (enabledPaymentMethods) {
            requestData.enabled_payment_methods = enabledPaymentMethods;
        }

        // Only offer to store payment details to identifiable, registered shoppers
        var orderCustomer = order.getCustomer();
        if (this.isSavePaymentDetailsEnabled()
            && orderCustomer
            && orderCustomer.isRegistered()
            && requestData.customer.email) {
            requestData.store_payment_details = 'enabled';
        }

        // Strip the optional fields the shopper left blank before sending
        return this.pruneEmpty(requestData);
    },

    /**
     * Create a payment session for an order.
     * @param {dw.order.Order} order The order instance
     * @returns {Object} An object holding either the session or an error flag
     */
    createPaymentSession: function(order) {
        var requestData = this.getSessionRequest(order);

        ckoHelper.log(
            flowConfig.PAYMENT_PROCESSOR_ID + ' ' + Resource.msg('cko.request.data', 'cko', null),
            requestData
        );

        var mode = ckoHelper.getValue(constants.CKO_MODE) === 'live' ? 'live' : 'sandbox';
        var service = flowSessions[mode](flowConfig.SESSION_SERVICE_PREFIX + mode + '.service');

        var response = service.call(requestData);

        if (response.status !== 'OK' || !response.object || !response.object.id) {
            Logger.getLogger('checkoutcom').error(
                'Flow payment session could not be created for order {0}: {1}',
                order.getOrderNo(),
                response.errorMessage || response.msg || 'unknown error'
            );

            return { error: true, session: null };
        }

        ckoHelper.log(
            flowConfig.PAYMENT_PROCESSOR_ID + ' ' + Resource.msg('cko.response.data', 'cko', null),
            response.object
        );

        return { error: false, session: response.object };
    },

    /**
     * Read a payment back from the gateway (GET /payments/{id}).
     * @param {string} paymentId The payment or payment session id
     * @returns {Object|null} The payment data, or null when it cannot be read
     */
    getPaymentDetails: function(paymentId) {
        if (!paymentId) {
            return null;
        }

        var serviceId = flowConfig.VERIFY_SERVICE_PREFIX
            + ckoHelper.getValue(constants.CKO_MODE) + '.service';

        var payment = ckoHelper.gatewayClientRequest(serviceId, { paymentToken: paymentId }, 'GET');

        if (!payment || typeof payment !== 'object' || !payment.id) {
            return null;
        }

        return payment;
    },

    /**
     * Check whether a payment read from the gateway is approved.
     * @param {Object} payment The payment data
     * @returns {boolean} True when the order may be placed as paid
     */
    isApproved: function(payment) {
        if (!payment || !payment.status) {
            return false;
        }

        if (flowConfig.APPROVED_STATUSES.indexOf(payment.status) === -1) {
            return false;
        }

        // approved is absent on some alternative payment methods; when it is
        // present it is authoritative.
        if (Object.prototype.hasOwnProperty.call(payment, 'approved') && payment.approved === false) {
            return false;
        }

        if (Object.prototype.hasOwnProperty.call(payment, 'response_code')
            && flowConfig.APPROVED_RESPONSE_CODES.indexOf(payment.response_code) === -1) {
            return false;
        }

        return true;
    },

    /**
     * Check whether a payment is still awaiting a delayed shopper action, such as
     * a Multibanco or Fawry voucher being paid at a later date.
     * @param {Object} payment The payment data
     * @returns {boolean} True when the payment is pending
     */
    isPending: function(payment) {
        return !!payment && flowConfig.PENDING_STATUSES.indexOf(payment.status) !== -1;
    },

    /**
     * Check that a payment really belongs to an order before it is trusted.
     * Guards against a tampered payment id being replayed against another order.
     * @param {Object} payment The payment data
     * @param {dw.order.Order} order The order instance
     * @returns {boolean} True when the payment matches the order
     */
    matchesOrder: function(payment, order) {
        if (!payment || !order) {
            return false;
        }

        if (payment.reference !== order.getOrderNo()) {
            Logger.getLogger('checkoutcom').warn(
                'Flow payment {0} references {1} but was returned for order {2}.',
                payment.id,
                payment.reference,
                order.getOrderNo()
            );

            return false;
        }

        var expectedAmount = parseInt(ckoHelper.getAmount(order), 10);
        var paidAmount = parseInt(payment.amount, 10);

        if (!Number.isNaN(paidAmount) && paidAmount !== expectedAmount) {
            Logger.getLogger('checkoutcom').warn(
                'Flow payment {0} is for {1} but order {2} totals {3}.',
                payment.id,
                paidAmount,
                order.getOrderNo(),
                expectedAmount
            );

            return false;
        }

        if (payment.currency && payment.currency !== order.getCurrencyCode()) {
            return false;
        }

        return true;
    },

    /**
     * Release an authorization that cannot be turned into a placed order.
     * Best effort only: a failure is logged and swallowed because the order is
     * failed either way and the Checkout.com webhooks remain the source of truth.
     * @param {string} paymentId The payment id to void
     * @param {string} orderNo The order number, used for logging only
     */
    voidPayment: function(paymentId, orderNo) {
        if (!paymentId) {
            return;
        }

        try {
            var serviceId = flowConfig.VOID_SERVICE_PREFIX
                + ckoHelper.getValue(constants.CKO_MODE) + '.service';

            ckoHelper.gatewayClientRequest(serviceId, {
                chargeId: paymentId,
                reference: orderNo,
            });
        } catch (e) {
            Logger.getLogger('checkoutcom').error(
                'Flow payment {0} for order {1} could not be voided: {2}',
                paymentId,
                orderNo,
                e.message
            );
        }
    },

    /**
     * Build the view data the Flow page needs to boot the web components bundle.
     * @param {dw.order.Order} order The order instance
     * @param {Object} session The payment session returned by the gateway
     * @returns {Object} The Flow view data
     */
    getViewData: function(order, session) {
        var appearance = this.getAppearance();

        return {
            componentsUrl: flowConfig.COMPONENTS_URL,
            publicKey: this.getPublicKey(),
            environment: this.getEnvironment(),
            locale: this.getLocale(),
            appearanceJson: appearance ? JSON.stringify(appearance) : '',
            paymentSessionJson: JSON.stringify(session),
            orderNo: order.getOrderNo(),
            completeUrl: URLUtils.https('CKOFlow-Complete').toString(),
            failureUrl: URLUtils.https('CKOFlow-HandleFail', 'ref', order.getOrderNo()).toString(),
            siteName: Site.getCurrent().getName(),
        };
    },
};

/*
 * Module exports
 */
module.exports = flowHelper;
