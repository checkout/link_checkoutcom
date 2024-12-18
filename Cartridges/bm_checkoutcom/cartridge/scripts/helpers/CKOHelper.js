'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');

// Card Currency Config
var ckoCurrencyConfig = require('*/cartridge/config/ckoCurrencyConfig');
var totalPages;

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Helper functions for the Checkout.com cartridge integration.
 */
var CKOHelper = {
    /**
     * Handles string translation with language resource files.
     * @param {string} strValue The strin to translate
     * @param {string} strFile The translation file
     * @returns {string} Retuns the translated string
     */
    _: function(strValue, strFile) {
        return Resource.msg(strValue, strFile, null);
    },

    /**
     * Get the Checkout.com orders.
     * @returns {array} Retuns the orders array
     */
    getCkoOrders: function() {
        // eslint-disable-next-line
        var query = this.parseQuery(request.httpQueryString);
        var year;
        if (query.year) {
            year = query.year;
        } else {
            // eslint-disable-next-line no-undef
            year = request.httpParameterMap.get('year').stringValue;
        }

        var split = year.split('-');
        var startDate = new Date(split[0], '00', '01');
        var endDate = new Date(split[1], '00', '01');
        var result = OrderMgr.searchOrders('creationDate >= {0} AND creationDate < {1}', 'creationDate desc', startDate, endDate);

        if (!query.page) {
            return result.asList();
        }

        var page = query.page;
        var pagination = query.size;
        var start = (page - 1) * pagination;

        totalPages = Math.ceil(result.getCount() / pagination);

        return result.asList(start, pagination);
    },

    /**
     * Get the Checkout.com transactions.
     * @returns {array} Retuns the transactions array
     */
    getCkoTransactions: function() {
        // Prepare the output array
        var data = [];

        // Query the orders
        var result = this.getCkoOrders();

        // Loop through the results
        var i = 1;
        for (var j = 0; j < result.length; j++) {
            // Get the payment instruments
            var paymentInstruments = result[j].getPaymentInstruments().toArray();
            var k = paymentInstruments.length - 1;

            var paymentTransaction = paymentInstruments[k].getPaymentTransaction();
            // Add the payment transaction to the output
            if (!this.containsObject(paymentTransaction, data) && this.isTransactionNeeded(paymentTransaction, paymentInstruments[k])) {
                // Build the row data
                var row = {
                    id: i,
                    order_no: result[j].orderNo,
                    transaction_id: paymentTransaction.transactionID,
                    action_id: paymentTransaction.custom.ckoActionId,
                    opened: paymentTransaction.custom.ckoTransactionOpened,
                    amount: result[j].getTotalGrossPrice().value,
                    currency: paymentTransaction.amount.currencyCode,
                    creation_date: paymentTransaction.getCreationDate().toDateString(),
                    type: paymentTransaction.type.displayValue,
                    processor: this.getProcessorId(paymentInstruments[k]),
                    refundable_amount: this.getRefundableAmount(paymentInstruments),
                    captured_amount: this.getCapturedAmount(paymentInstruments),
                    data_type: paymentTransaction.type.toString(),
                    nasEnabled: result[j].custom.orderProcessedByABCorNAS,
                };

                // Add the transaction
                data.push(row);
                i++;
            }
        }

        return {
            last_page: totalPages,
            data: data,
        };
    },

    /**
     * Parse a query String
     * @param {string} queryString The query string of the URL
     * @returns {Object} The query string as an object
     */
    parseQuery: function(queryString) {
        var query = {};
        var pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split('=');
            query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
        }
        return query;
    },

    /**
     * Check if a capture transaction can allow refunds.
     * @param {array} paymentInstruments The paymentInstruments array
     * @returns {number} The refundable amount
     */
    getRefundableAmount: function(paymentInstruments) {
        // Prepare the totals
        var totalRefunded = 0;
        var totalCaptured = 0;

        // Loop through the payment instruments
        // eslint-disable-next-line
        for (var i = 0; i < paymentInstruments.length; i++) {
            // Get the payment transaction
            var paymentTransaction = paymentInstruments[i].getPaymentTransaction();

            // Calculate the total refunds
            if (paymentTransaction.type.toString() === PaymentTransaction.TYPE_CREDIT) {
                totalRefunded += parseFloat(paymentTransaction.amount.value);
            }

            // Calculate the total captures
            if (paymentTransaction.type.toString() === PaymentTransaction.TYPE_CAPTURE) {
                totalCaptured += parseFloat(paymentTransaction.amount.value);
            }
        }

        // Return the final amount
        var finalAmount = totalCaptured - totalRefunded;
        return finalAmount.toFixed(2);
    },

    /**
     * Check if a partial capture transaction can allow captures.
     * @param {array} paymentInstruments The paymentInstruments array
     * @returns {number} The captured amount
     */
    getCapturedAmount: function(paymentInstruments) {
        // Prepare the totals
        var totalCaptured = 0;

        // Loop through the payment instruments
        // eslint-disable-next-line
        for (var i = 0; i < paymentInstruments.length; i++) {
            // Get the payment transaction
            var paymentTransaction = paymentInstruments[i].getPaymentTransaction();

            // Calculate the total captures
            if (paymentTransaction.type.toString() === PaymentTransaction.TYPE_CAPTURE) {
                totalCaptured += parseFloat(paymentTransaction.amount.value);
            }
        }

        // Return the final amount
        var finalAmount = totalCaptured;
        return finalAmount.toFixed(2);
    },
    /**
     * Checks if a transaction should be returned in the reaults.
     * @param {Object} paymentTransaction The paymentTransaction object
     * @param {Object} paymentInstrument The paymentInstrument object
     * @returns {boolean} The status of the current transaction
     */
    isTransactionNeeded: function(paymentTransaction, paymentInstrument) {
        // Get an optional transaction id
        // eslint-disable-next-line
        var pid = request.httpParameterMap.get('tid').stringValue;

        // Return true only if conditions are met
        // eslint-disable-next-line
        var isPidExist = pid && (paymentTransaction.custom.ckoActionId === pid || paymentTransaction.transactionID === pid) || !pid;
        var isCheckoutComProcessor = this.isCkoItem(this.getProcessorId(paymentInstrument));
        var isTransactionIdExist = paymentTransaction.transactionID && paymentTransaction.transactionID !== '';

        if (isPidExist && isCheckoutComProcessor && isTransactionIdExist) {
            return true;
        }

        return false;
    },

    /**
     * Checks if a payment instrument is Checkout.com.
     * @param {Object} item The payment instrument
     * @returns {boolean} The status of the current payment instrument
     */
    isCkoItem: function(item) {
        return item.length > 0 && item.indexOf('CHECKOUTCOM_') >= 0;
    },

    /**
     * Get the processor ID for a payment instrument.
     * @param {Object} instrument The payment instrument
     * @returns {string} The payment instrument Id
     */
    getProcessorId: function(instrument) {
        var paymentMethodId;

        if (instrument.getPaymentMethod() === 'CHECKOUTCOM_CARD') {
            paymentMethodId = 'CREDIT_CARD';
        } else {
            paymentMethodId = instrument.getPaymentMethod();
        }

        var paymentMethod = PaymentMgr.getPaymentMethod(paymentMethodId);

        if (paymentMethod) {
            if (paymentMethod.getPaymentProcessor()) {
                return paymentMethod.getPaymentProcessor().getID();
            }
        }
        return '';
    },

    /**
     * Checks if an object already exists in an array.
     * @param {Object} obj The object
     * @param {array} list The list of objects to parse
     * @returns {boolean} The status of the current object
     */
    containsObject: function(obj, list) {
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] === obj) {
                return true;
            }
        }

        return false;
    },

    /**
     * Loads an order by track id.
     * @returns {Object} The loaded order
     */
    loadOrderFromRequest: function() {
        // Get the order from the request
        // eslint-disable-next-line
        var trackId = request.httpParameterMap.get('trackId').stringValue;

        return OrderMgr.getOrder(trackId);
    },

    /**
     * Writes gateway information to the website's custom log files.
     * @param {string} dataType The data type
     * @param {Object} gatewayData The gateway data
     */
    log: function(dataType, gatewayData) {
        if (this.getValue(constants.CKO_DEBUG_ENABLED) === true && (gatewayData)) {
            // Get the logger
            var logger = Logger.getLogger('ckodebug');

            // Remove sensitive data
            // eslint-disable-next-line
            gatewayData = this.removeSentisiveData(gatewayData);

            if (logger) {
                logger.debug(this._('cko.gateway.name', 'cko') + ' ' + dataType + ' : {0}', JSON.stringify(gatewayData));
            }
        }
    },

    /**
     * Remove sentitive data from the logs.
     * @param {Object} data The raw gateway data
     * @returns {Object} The clean gateway data
     */
    removeSentisiveData: function(data) {
        // Card data
        if (Object.prototype.hasOwnProperty.call(data, 'source')) {
            if (Object.prototype.hasOwnProperty.call(data.source, 'source')) data.source.number.replace(/^.{14}/g, '*');
            if (Object.prototype.hasOwnProperty.call(data.source, 'cvv')) data.source.cvv.replace(/^.{3}/g, '*');
            if (Object.prototype.hasOwnProperty.call(data.source, 'billing_address')) delete data.source.billing_address; // eslint-disable-line no-param-reassign
            if (Object.prototype.hasOwnProperty.call(data.source, 'phone')) delete data.source.phone; // eslint-disable-line no-param-reassign
            if (Object.prototype.hasOwnProperty.call(data.source, 'name')) delete data.source.name; // eslint-disable-line no-param-reassign
        }

        // Customer data
        if (Object.prototype.hasOwnProperty.call(data, 'customer')) delete data.customer; // eslint-disable-line no-param-reassign
        if (Object.prototype.hasOwnProperty.call(data, 'shipping')) delete data.shipping; // eslint-disable-line no-param-reassign
        if (Object.prototype.hasOwnProperty.call(data, 'billing')) delete data.billing; // eslint-disable-line no-param-reassign

        return data;
    },

    /**
     * Create an HTTP client to handle request to gateway.
     * @param {string} serviceId The service Id
     * @param {Object} requestData The request data
     * @param {string} method The method Id
     * @returns {Object} The HTTP response
     */
    getGatewayClient: function(serviceId, requestData, method) {
        // eslint-disable-next-line
        var method = method || 'POST';
        var serv = this.getService(serviceId);

        // Prepare the request URL and data
        if (Object.prototype.hasOwnProperty.call(requestData, 'chargeId')) {
            var requestUrl = serv.getURL().replace('chargeId', requestData.chargeId);
            var regionEndPoint = this.getValue(constants.CKO_REGION_END_POINT);
            var region = this.getValue(constants.CKO_REGION);
            if (region && regionEndPoint && region.value !== 'Others') {
                requestUrl = requestUrl.replace(constants.CKO_END_POINTS, regionEndPoint);
            }
            serv.setURL(requestUrl);
            delete requestData.chargeId; // eslint-disable-line no-param-reassign
        }

        // Set the request method
        serv.setRequestMethod(method);

        // Call the service
        var resp = serv.call(requestData);
        if (resp.status !== 'OK') {
            return resp.error;
        }

        return resp.object;
    },

    /**
     * Get the HTTP service.
     * @param {string} serviceId The service Id
     * @returns {Object} The service instance
     */
    getService: function(serviceId) {
        var parts = serviceId.split('.');
        var entity = parts[1];
        var action = parts[2];
        var mode = parts[3];
        var svcFile = entity + action.charAt(0).toUpperCase() + action.slice(1);
        var svcClass = require('*/cartridge/scripts/services/' + svcFile);

        return svcClass[mode]();
    },

    /**
     * Returns a price formatted for processing by the gateway.
     * @param {number} amount The amount to format
     * @param {string} currency The currency code
     * @returns {number} The formatted amount
     */
    getFormattedPrice: function(amount, currency) {
        var totalFormated;
        if (currency) {
            var ckoFormateBy = this.getCkoFormatedValue(currency);
            totalFormated = amount * ckoFormateBy;

            return totalFormated.toFixed();
            // eslint-disable-next-line
        } else {
            totalFormated = amount * 100;
            return totalFormated.toFixed();
        }
    },

    /**
     * Currency conversion mapping.
     * @param {string} currency The currency code
     * @returns {number} The conversion factor
     */
    getCkoFormatedValue: function(currency) {
        if (ckoCurrencyConfig.x1.currencies.match(currency)) {
            return ckoCurrencyConfig.x1.multiple;
        } else if (ckoCurrencyConfig.x1000.currencies.match(currency)) {
            return ckoCurrencyConfig.x1000.multiple;
        }
        return 100;
    },

    /**
     * The cartridge metadata.
     * @returns {string} The platform metadata
     */
    getCartridgeMeta: function() {
        return this.getValue('ckoBmPlatformData');
    },

    /**
     * Retrieves a custom preference value from the configuration.
     * @param {string} fieldName The configuration field name
     * @returns {string} The configuration field value
     */
    getValue: function(fieldName) {
        return Site.getCurrent().getCustomPreferenceValue(fieldName);
    },

    /**
     * Get live or sandbox account keys.
     * @param {string} service order processed by ABC or NAS
     * @returns {Object} The configuration account keys
     */
    getAccountKeys: function(service) {
        var keys = {};
        var ckoMode = this.getValue(constants.CKO_MODE);
        var str = ckoMode && ckoMode.value === 'live' ? 'Live' : 'Sandbox';
        var liveOrSandboxPreference = (str === 'Live') ? constants.CKO_LIVE_NAS_ENABLED : constants.CKO_SANDBOX_NAS_ENABLED;
        var nasEnabled = service || this.getValue(liveOrSandboxPreference);

        keys.publicKey = this.getValue('cko' + str + nasEnabled + 'PublicKey');
        keys.secretKey = this.getValue('cko' + str + nasEnabled + 'SecretKey');
        keys.privateKey = this.getValue('cko' + str + nasEnabled + 'PrivateKey');

        return keys;
    },

    /**
     * Get live or sandbox nas enabled value.
     * @returns {Object} The NAS value
     */
    getNasEnabled: function() {
        var str = this.getValue(constants.CKO_MODE) === 'live' ? 'Live' : 'Sandbox';
        var liveOrSandboxPreference = (str === 'Live') ? constants.CKO_LIVE_NAS_ENABLED : constants.CKO_SANDBOX_NAS_ENABLED;
        var nasEnabled = this.getValue(liveOrSandboxPreference);
        return nasEnabled;
    },
};

/*
 * Module exports
 */

module.exports = CKOHelper;
