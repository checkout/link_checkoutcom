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

/** The list's page size: the console's default, and the most one request may ask for. */
var DEFAULT_PAGE_SIZE = 50;
var MAX_PAGE_SIZE = 100;

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
     * Get the Checkout.com orders of a year range, one page at a time.
     *
     * Only orders placed with Checkout.com (custom.orderProcessedByABCorNAS, set
     * when a Checkout.com order is created), so the query never walks every order
     * of the site. The range is validated (YYYY-YYYY, at most 10 years) and the
     * list is always paged.
     * @returns {array} The orders of the page
     */
    getCkoOrders: function() {
        // eslint-disable-next-line
        var query = this.parseQuery(request.httpQueryString || '');
        // eslint-disable-next-line no-undef
        var range = this.parseYearRange(query.year || request.httpParameterMap.get('year').stringValue);
        var result = OrderMgr.searchOrders(
            'creationDate >= {0} AND creationDate < {1} AND custom.orderProcessedByABCorNAS != NULL',
            'creationDate desc',
            range.start,
            range.end
        );
        // eslint-disable-next-line no-undef
        var tid = request.httpParameterMap.get('tid').stringValue;

        // One transaction (the console's detail view): the order holding it, found
        // without loading the whole list
        if (tid) {
            var found = [];

            while (result.hasNext() && found.length === 0) {
                var candidate = result.next();
                var instrument = this.getCkoInstrument(candidate);
                var transaction = instrument ? instrument.getPaymentTransaction() : null;

                if (transaction && (transaction.getTransactionID() === tid || transaction.custom.ckoActionId === tid)) {
                    found.push(candidate);
                }
            }

            result.close();
            totalPages = 1;

            return found;
        }

        var size = Math.min(Math.max(parseInt(query.size, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
        var page = Math.max(parseInt(query.page, 10) || 1, 1);

        totalPages = Math.max(Math.ceil(result.getCount() / size), 1);

        var orders = result.asList((page - 1) * size, size).toArray();

        result.close();

        return orders;
    },

    /**
     * @param {string} value A year range from the console, "YYYY-YYYY"
     * @returns {Object} { start, end }: the dates; this year when the value is missing or invalid
     */
    parseYearRange: function(value) {
        var match = /^(\d{4})-(\d{4})$/.exec(String(value || ''));
        var thisYear = new Date().getFullYear();
        var from = match ? parseInt(match[1], 10) : thisYear;
        var to = match ? parseInt(match[2], 10) : thisYear + 1;

        if (!match || to <= from || to - from > 10) {
            from = thisYear;
            to = thisYear + 1;
        }

        return { start: new Date(from, 0, 1), end: new Date(to, 0, 1) };
    },

    /**
     * The order's Checkout.com payment instrument: the last CHECKOUTCOM_ one with a payment id.
     * @param {dw.order.Order} order The order
     * @returns {dw.order.OrderPaymentInstrument|null} The instrument, or null
     */
    getCkoInstrument: function(order) {
        var instruments = order.getPaymentInstruments().toArray();

        for (var i = instruments.length - 1; i >= 0; i--) {
            var transaction = instruments[i].getPaymentTransaction();

            if (String(instruments[i].getPaymentMethod() || '').indexOf('CHECKOUTCOM_') === 0 && transaction && transaction.getTransactionID()) {
                return instruments[i];
            }
        }

        return null;
    },

    /**
     * @param {dw.order.Order} order The order
     * @returns {string|null} The order's own Checkout.com payment id (pay_…)
     */
    getOrderPaymentId: function(order) {
        var instrument = this.getCkoInstrument(order);
        var id = instrument ? String(instrument.getPaymentTransaction().getTransactionID()) : null;

        return id && /^pay_[a-z0-9]+$/i.test(id) ? id : null;
    },

    /**
     * The payment's balances on Checkout.com (GET /payments/{id}), with the keys of
     * the account the order was processed with.
     * @param {dw.order.Order} order The order
     * @param {string} paymentId The payment id
     * @returns {Object|null} balances (minor units), or null when not available
     */
    getPaymentBalances: function(order, paymentId) {
        var self = this;
        var mode = String(this.getValue(constants.CKO_MODE)) === 'live' ? 'live' : 'sandbox';

        try {
            var service = LocalServiceRegistry.createService('cko.verify.charges.' + mode + '.service', {
                createRequest: function(svc) {
                    var url = svc.getURL().replace(/\/$/, '') + '/' + encodeURIComponent(paymentId);
                    var endpoint = self.getServiceEndpoint();

                    svc.setURL(endpoint ? url.replace(constants.CKO_END_POINTS, endpoint) : url);
                    svc.setRequestMethod('GET');
                    svc.addHeader('Authorization', self.getAccountKeys(order.custom.orderProcessedByABCorNAS).secretKey);
                    svc.addHeader('User-Agent', self.getCartridgeMeta());

                    return null;
                },
                parseResponse: function(svc, response) {
                    return JSON.parse(response.text);
                },
                getRequestLogMessage: function() {
                    return 'GET /payments/{id}';
                },
                getResponseLogMessage: function(response) {
                    return 'HTTP ' + response.statusCode;
                },
            });
            var result = service.call();

            return result.isOk() && result.getObject() && result.getObject().balances ? result.getObject().balances : null;
        } catch (e) {
            Logger.getLogger('checkoutcom').warn('Payment {0}: balances not read: {1}', paymentId, e.message);

            return null;
        }
    },

    /**
     * What can still be captured, refunded or voided for the order's payment, in
     * minor units: the payment's balances on Checkout.com, or, for an account
     * whose payments carry none, the order's own captures and refunds.
     * @param {dw.order.Order} order The order
     * @param {string} paymentId The order's payment id
     * @param {string} task capture, refund or void
     * @returns {number|null} The amount, or null when it can't be told
     */
    getAvailableAmount: function(order, paymentId, task) {
        var balances = this.getPaymentBalances(order, paymentId);
        var field = { capture: 'available_to_capture', refund: 'available_to_refund', void: 'available_to_void' }[task];

        if (balances && typeof balances[field] === 'number') {
            return balances[field];
        }

        var currency = order.getCurrencyCode();
        var instruments = order.getPaymentInstruments().toArray();
        var minor = function(value) {
            return Number(this.getFormattedPrice(String(value), currency));
        }.bind(this);
        var total = minor(order.getTotalGrossPrice().getValue());
        var captured = minor(this.getCapturedAmount(instruments));
        var refundable = minor(this.getRefundableAmount(instruments));

        Logger.getLogger('checkoutcom').info('Payment {0}: no balances from Checkout.com; using the order\'s captures and refunds.', paymentId);

        if (task === 'capture') {
            return Math.max(total - captured, 0);
        }

        if (task === 'refund') {
            return Math.max(refundable, 0);
        }

        return captured > 0 ? 0 : total;
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
            // The Checkout.com instrument; orders without one (a zero-total order) are skipped
            var paymentInstruments = result[j].getPaymentInstruments().toArray();
            var instrument = this.getCkoInstrument(result[j]);

            if (!instrument) {
                continue; // eslint-disable-line no-continue
            }

            var paymentTransaction = instrument.getPaymentTransaction();
            // Add the payment transaction to the output
            if (!this.containsObject(paymentTransaction, data) && this.isTransactionNeeded(paymentTransaction, instrument)) {
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
                    processor: this.getProcessorId(instrument),
                    refundable_amount: this.getRefundableAmount(paymentInstruments),
                    captured_amount: this.getCapturedAmount(paymentInstruments),
                    data_type: paymentTransaction.type.toString(),
                    nasEnabled: result[j].custom.orderProcessedByABCorNAS,
                    payment_method: instrument.getPaymentMethod(),
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
            // The payment id goes in the URL path: encoded
            var requestUrl = serv.getURL().replace('chargeId', encodeURIComponent(requestData.chargeId));
            var serviceEndpoint = this.getServiceEndpoint();
            if (serviceEndpoint) {
                requestUrl = requestUrl.replace(constants.CKO_END_POINTS, serviceEndpoint);
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
        // Static module paths (no require() built from input); loaded on use, as
        // the service modules require this helper
        var services = {
            transactionCapture: function() { return require('*/cartridge/scripts/services/transactionCapture'); },
            transactionRefund: function() { return require('*/cartridge/scripts/services/transactionRefund'); },
            transactionVoid: function() { return require('*/cartridge/scripts/services/transactionVoid'); },
            klarna_transactionCapture: function() { return require('*/cartridge/scripts/services/klarna_transactionCapture'); },
            klarna_transactionVoid: function() { return require('*/cartridge/scripts/services/klarna_transactionVoid'); },
        };
        var svcFile = entity + action.charAt(0).toUpperCase() + action.slice(1);

        if (!Object.prototype.hasOwnProperty.call(services, svcFile)) {
            throw new Error('Unknown Checkout.com service ' + serviceId);
        }

        return services[svcFile]()[mode]();
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
        // Whole codes only: a substring match would accept partial codes
        var code = String(currency || '').toUpperCase();

        if (ckoCurrencyConfig.x1.currencies.split(' ').indexOf(code) !== -1) {
            return ckoCurrencyConfig.x1.multiple;
        } else if (ckoCurrencyConfig.x1000.currencies.split(' ').indexOf(code) !== -1) {
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
     * Validate the configured Service Endpoint URL.
     * @param {string} endpoint The configured Service Endpoint value
     * @returns {boolean} True if the value is a usable base URL
     */
    isValidServiceEndpoint: function(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            return false;
        }
        var trimmed = endpoint.trim();
        var pattern = /^https:\/\/[A-Za-z0-9.\-]+(:\d+)?\/?$/;
        return pattern.test(trimmed);
    },

    /**
     * Resolve the Service Endpoint configured in Business Manager.
     * @returns {string|null} The configured base URL or null when unset/invalid
     */
    getServiceEndpoint: function() {
        var endpoint = this.getValue(constants.CKO_REGION_END_POINT);
        if (this.isValidServiceEndpoint(endpoint)) {
            return endpoint.trim().replace(/\/$/, '');
        }
        if (endpoint) {
            Logger.getLogger('checkoutcom').warn(
                'Invalid Service Endpoint configured; falling back to default service credentials URL.'
            );
        }
        return null;
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
