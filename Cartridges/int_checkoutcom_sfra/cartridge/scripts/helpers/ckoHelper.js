'use strict';

/* API Includes */
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var BasketMgr = require('dw/order/BasketMgr');
var Logger = require('dw/system/Logger');
var SystemObjectMgr = require('dw/object/SystemObjectMgr');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Locale = require('dw/util/Locale');

/* Card Currency Config */
var ckoCurrencyConfig = require('*/cartridge/config/ckoCurrencyConfig');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/* Sensitive Data Helper */
var sensitiveDataHelper = require('*/cartridge/scripts/helpers/sensitiveDataHelper.js');

/**
 * Utility functions.
 */
var ckoHelper = {
    /**
     * Get a failed payment error message.
     * @returns {string} The message string
     */
    getPaymentFailureMessage: function() {
        return Resource.msg('cko.transaction.failedMessage1', 'cko', null)
        + ' ' + Resource.msg('cko.transaction.failedMessage2', 'cko', null);
    },

    /**
     * Get a failed order error message.
     * @returns {string} The message string
     */
    getOrderFailureMessage: function() {
        return Resource.msg('cko.transaction.failedMessage1', 'cko', null)
        + ' ' + Resource.msg('cko.transaction.failedMessage3', 'cko', null);
    },


    /**
     * Get the user language.
     * @returns {string} The user language code
     */
    getLanguage: function() {
        // eslint-disable-next-line
        return request.locale.replace('_', '-');
    },

    /**
     * Get the site name.
     * @returns {string} The site name
     */
    getSiteName: function() {
        return Site.getCurrent().name;
    },

    /**
     * Get the site hostname.
     * @returns {string} The site host name
     */
    getSiteHostName: function() {
        return Site.getCurrent().httpHostName;
    },

    /**
     * Check if the gateway response is valid.
     * @param {Object} req The HTTP response data
     * @returns {boolean} Is the private shared key valid
     */
    isValidResponse: function(req) {
        var requestKey = req.httpHeaders.authorization;
        var privateSharedKey = this.getAccountKeys().privateSharedKey;

        return requestKey === privateSharedKey;
    },

    /**
     * Converts gateway error message to a localized message
     * @param {string} message from  auth request
     * @returns {string} localized error message
     */
    errorMessage: function(message) {
        var messageArray = message.split(' ');
        var result = 'error.';
        if (messageArray) {
            messageArray.forEach(function(value) {
                result += value;
            });
        } else {
            result += message;
        }

        return Resource.msg(result, 'cko', null);
    },

    /**
     * Get value from custom preferences.
     * @param {string} field The field id
     * @returns {string} The preference value
     */
    getValue: function(field) {
        return Site.getCurrent().getCustomPreferenceValue(field);
    },

    /**
     * Get the site country code from locale.
     * @returns {string} The site  country code
     */
    getSiteCountryCode: function() {
        return Site.getCurrent().defaultLocale.split('_')[1];
    },

    /**
     * Get the site country code from locale.
     * @returns {string} The site  country code
     */
    getSiteCurrentCountryCode: function() {
        // return Site.getCurrent().defaultLocale.split('_')[1];
        var currentLocale = request.getLocale();
        var locale = Locale.getLocale(currentLocale);
        var countryCode = locale.getCountry();

        return countryCode;
    },

    /**
     * Handles string translation with language resource files.
     * @param {string} strValue The string value
     * @param {string} strFile The file name
     * @returns {string} The translated string value
     */
    _: function(strValue, strFile) {
        return Resource.msg(strValue, strFile, null);
    },

    /**
     * Write gateway information to the website's custom log file.
     * @param {string} dataType The data type
     * @param {Object} gatewayData The gateway data
     */
    log: function(dataType, gatewayData) {
        // Create's a deep copy gatewayData, this will prevent data being deleted.
        var cloneGatewayData = JSON.parse(JSON.stringify(gatewayData));
        if (this.getValue(constants.CKO_DEBUG_ENABLED) === true) {
            // Get the logger
            var logger = Logger.getLogger('ckodebug');

            // Remove sensitive data
            var cleanData = this.removeSentisiveData(cloneGatewayData);

            // Log the data
            if (logger) {
                logger.debug(
                    dataType + ' : {0}',
                    JSON.stringify(cleanData)
                );
            }
        }
    },

    /**
     * Remove sentitive data from the logs.
     * @param {Object} data The log data
     * @returns {Object} The filtered data
     */
    removeSentisiveData: function(data) {
        if (data) {
            if (Object.prototype.hasOwnProperty.call(data, 'response_data')) {
                if (Object.prototype.hasOwnProperty.call(data.response_data, 'mandate_reference')) { // eslint-disable-next-line
                    data.response_data.mandate_reference = String.prototype.replace.call(data.response_data.mandate_reference, /\w/gi, '*');
                }
            }
            if (Object.prototype.hasOwnProperty.call(data, 'source_data')) { // eslint-disable-next-line
                data.source_data = sensitiveDataHelper.cleanSourceDataObject(data.source_data);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'source')) { // eslint-disable-next-line
                data.source = sensitiveDataHelper.cleanSourceObject(data.source);
            }

            if (Object.prototype.hasOwnProperty.call(data, 'customer')) { // eslint-disable-next-line
                data.customer = sensitiveDataHelper.cleanCustomerObject(data.customer);
            }

            if (Object.prototype.hasOwnProperty.call(data, 'shipping')) { // eslint-disable-next-line
                data.shipping = sensitiveDataHelper.cleanShippingObject(data.shipping);
            }

            if (Object.prototype.hasOwnProperty.call(data, 'billing_address')) { // eslint-disable-next-line
                data.billing_address = sensitiveDataHelper.cleanBillingAddress(data.billing_address);
            }
        }

        return data;
    },

    /**
     * Return an order id.
     * @returns {string} The order id
     */
    getOrderId: function() {
        // eslint-disable-next-line
        var orderId = (this.getValue(constants.CKO_3DS)) ? request.httpParameterMap.get('reference').stringValue : request.httpParameterMap.get('reference').stringValue;
        if (orderId === null) {
            // eslint-disable-next-line
            orderId = session.privacy.ckoOrderId;
        }

        return orderId;
    },

    /**
     * Get the cartridge metadata.
     * @returns {string} The platform data
     */
    getCartridgeMeta: function() {
        return this.getValue(constants.CKO_SFRA_PLATFORM_DATA);
    },

    /**
     * Get a customer full name.
     * @param {Object} customerProfile The customer profile instance
     * @returns {string} The customer name
     */
    getCustomerFullName: function(customerProfile) {
        var customerName = '';
        customerName += customerProfile.firstName;
        customerName += ' ' + customerProfile.lastName;

        return customerName;
    },

    /**
     * Get the account API keys.
     * @returns {Object} The account keys object
     */
    getAccountKeys: function() {
        var keys = {};
        var str = this.getValue(constants.CKO_MODE) === 'live' ? 'Live' : 'Sandbox';
        var liveOrSandboxPreference = (str === 'Live') ? constants.CKO_LIVE_NAS_ENABLED : constants.CKO_SANDBOX_NAS_ENABLED;
        var nasEnabled = this.getValue(liveOrSandboxPreference);


        keys.publicKey = this.getValue('cko' + str + nasEnabled + 'PublicKey');
        keys.secretKey = this.getValue('cko' + str + nasEnabled + 'SecretKey');
        keys.privateSharedKey = this.getValue('cko' + str + nasEnabled + 'PrivateSharedKey');

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

    /**
     * Create an HTTP client to handle request to gateway.
     * @param {string} serviceId The service id
     * @param {Object} data The request data
     * @param {string} method The HTTP request method
     * @returns {Object} The HTTP response object
     */
    gatewayClientRequest: function(serviceId, data, method) {
        // eslint-disable-next-line
        method = method || 'POST';
        var serv = this.getService(serviceId);
        var requestData = data;

        // Prepare the request URL and data
        if (Object.prototype.hasOwnProperty.call(requestData, 'chargeId')) {
            var requestUrl = serv.getURL().replace('chargeId', requestData.chargeId);
            serv.setURL(requestUrl);
            delete requestData.chargeId;
        }

        // set url based on region
        var regionEndPoint = this.getValue(constants.CKO_REGION_END_POINT);
        var region = this.getValue(constants.CKO_REGION);
        if (region && regionEndPoint && region.value !== 'Others') {
            var serviceUrl = serv.getURL().replace(constants.CKO_END_POINTS, regionEndPoint);
            serv.setURL(serviceUrl);
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
     * Create an HTTP client to get paypal order id.
     * @param {string} serviceId The service id
     * @param {Object} data The request data
     * @param {string} method The HTTP request method
     * @returns {Object} The HTTP response object
     */
    createContext: function(serviceId, data, method) {
    // eslint-disable-next-line
        method = method || 'POST';
        var serv = this.getService(serviceId);
        var requestData = data;

        // Prepare the request URL and data
        var requestUrl = serv.getURL();
        var regionEndPoint = this.getValue(constants.CKO_REGION_END_POINT);
        var region = this.getValue(constants.CKO_REGION);
        if (region && regionEndPoint && region.value !== 'Others') {
            requestUrl = requestUrl.replace(constants.CKO_END_POINTS, regionEndPoint);
        }
        serv.setURL(requestUrl);

        // Set the request method
        serv.setRequestMethod(method);

        // Call the service
        var resp = serv.call(requestData);

        return resp;
    },

    /**
     * Get an HTTP service.
     * @param {string} serviceId The service id
     * @returns {Object} The HTTP service instance
     */
    getService: function(serviceId) {
        var parts = serviceId.split('.');
        var entity = parts[1];
        var action = parts[2];
        var mode = parts[3];
        var svcFile = entity + action.charAt(0).toUpperCase() + action.slice(1);
        var svcClass;
        if (svcFile === 'verifyCharges' || svcFile === 'networkToken' || svcFile === 'cartesBancaires' || svcFile === 'paymentContexts') {
            svcClass = require('*/cartridge/scripts/services/' + svcFile);
        } else {
            svcClass = require('*/cartridge/scripts/services/ckoPayments');
        }

        return svcClass[mode](serviceId);
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
     * Format a price for a gateway request.
     * @param {number} price The price to format
     * @param {string} currency The currency code
     * @returns {number} The formatted price
     */
    getFormattedPrice: function(price, currency) {
        var ckoFormateBy = this.getCkoFormatedValue(currency);
        var orderTotalFormated = price * ckoFormateBy;

        return orderTotalFormated.toFixed();
    },

    /**
     * Get the Checkout.com orders.
     * @param {string} orderNo The order number
     * @returns {Array} The list of orders
     */
    getOrders: function(orderNo) {
        // Prepare the output array
        var data = [];

        // Query the orders
        var result = SystemObjectMgr.querySystemObjects('Order', 'orderNo = {0}', 'creationDate desc', orderNo);

        // Loop through the results
        while (result.hasNext()) {
            // Get the payment instruments
            var item = result.next();
            var paymentInstruments = item.getPaymentInstruments();

            // Loop through the payment instruments
            for (var i = 0; i < paymentInstruments.length; i++) {
                if (!this.containsObject(item, data)) {
                    data.push(item);
                }
            }
        }

        return data;
    },

    /**
     * Checks if an object already exists in an array.
     * @param {Object} obj The object
     * @param {Array} list The list of objects
     * @returns {boolean} If the object is found
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
     * Checks if a payment instrument is Checkout.com.
     * @param {Object} item The payment instrument instance
     * @returns {boolean} If the instance matches conditions
     */
    isCkoItem: function(item) {
        return item.length > 0 && item.indexOf('CHECKOUTCOM_') >= 0;
    },

    /**
     * Return the customer data.
     * @param {Object} order The order instance
     * @returns {Object} The customer data
     */
    getCustomer: function(order) {
        return {
            email: order.customerEmail,
            name: order.customerName,
        };
    },

    /**
     * Return a phone object.
     * @param {Object} billingAddress The billing data
     * @returns {Object} The phone object
     */
    getPhone: function(billingAddress) {
        return {
            country_code: null,
            number: billingAddress.getPhone(),
        };
    },

    /**
     * Strip spaces form a card number.
     * @param {string} num The number to process
     * @returns {string} The processed number
     */
    getFormattedNumber: function(num) {
        return num.toString().replace(/\s/g, '');
    },

    /**
     * Build the shipping data.
     * @param {Object} order The order instance
     * @returns {Object} The shipping data
     */
    getShipping: function(order) {
        // Get shipping address
        var shippingAddress = order.getDefaultShipment().getShippingAddress();

        // Create the address data
        var shippingDetails = {
            address_line1: shippingAddress.getAddress1(),
            address_line2: shippingAddress.getAddress2(),
            city: shippingAddress.getCity(),
            state: shippingAddress.getStateCode(),
            zip: shippingAddress.getPostalCode(),
            country: shippingAddress.getCountryCode().value,
        };

        // Build the shipping data
        var shipping = {
            address: shippingDetails,
            phone: this.getPhone(order.getBillingAddress()),
        };

        return shipping;
    },

    /**
     * Confirm is a payment is valid from API response code.
     * @param {Object} gatewayResponse The gateway response
     * @returns {boolean} The payment success or failure
     */
    paymentSuccess: function(gatewayResponse) {
        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'response_code')) {
            return gatewayResponse.response_code === '10000'
            || gatewayResponse.response_code === '10100'
            || gatewayResponse.response_code === '10200';
        }

        return false;
    },

    /**
     * Confirm is a payment is valid from API response code.
     * @param {Object} gatewayResponse The gateway response
     * @returns {boolean} The payment success or failure
     */
    paymentResponseValidation: function(gatewayResponse) {
        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'reference')) {
            return true;
        }
        return false;
    },


    /**
     * Confirm is a payment is valid from API redirect response code.
     * @param {Object} gatewayResponse The gateway response
     * @returns {boolean} Is redirection needed
     */
    redirectPaymentSuccess: function(gatewayResponse) {
        // eslint-disable-next-line no-undef
        if (Object.prototype.hasOwnProperty.call(gatewayResponse, 'actions') && !empty(gatewayResponse.actions)) {
            return gatewayResponse
          && (gatewayResponse.actions[0].response_code === '10000'
          || gatewayResponse.actions[0].response_code === '10100'
          || gatewayResponse.actions[0].response_code === '10200');
        }

        if (Object.prototype.hasOwnProperty.call(gatewayResponse, 'source')) {
            if (Object.prototype.hasOwnProperty.call(gatewayResponse.source, 'type') && (gatewayResponse.source.type === 'alipay' || gatewayResponse.source.type === 'oxxo' || gatewayResponse.source.type === 'boleto' || gatewayResponse.source.type === 'bancontact')) {
                return true;
            }
        }

        return false;
    },

    /**
     * Write the order information to session for the current shopper.
     * @param {Object} gatewayResponse The gateway response
     */
    updateCustomerData: function(gatewayResponse) {
        if ((gatewayResponse) && Object.prototype.hasOwnProperty.call(gatewayResponse, 'card')) {
            Transaction.wrap(function() {
                // eslint-disable-next-line
                if (session.customer.profile !== null) {
                    // eslint-disable-next-line
                    session.customer.profile.custom.ckoCustomerId = gatewayResponse.card.customerId;
                }
            });
        }
    },

    /**
     * Get the basket quantities.
     * @param {Object} args The method arguments
     * @returns {number} The basked quantities
     */
    getQuantity: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);
        var quantity = order.getProductQuantityTotal();

        return quantity;
    },

    /**
     * Get the billing descriptor object from custom preferences.
     * @returns {Object} The billing descriptor data
     */
    getBillingDescriptor: function() {
        var billingDescriptor = {
            name: this.getValue(constants.CKO_BILLING_DESCRIPTOR1),
            city: this.getValue(constants.CKO_BILLING_DESCRIPTOR2),
        };

        return billingDescriptor;
    },

    /**
     * Get the products information.
     * @param {Object} args The method arguments
     * @returns {Object} The product information
     */
    getProductInformation: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);
        var it = order.productLineItems.iterator();
        var products = [];

        // Loop through the itemd
        while (it.hasNext()) {
            var pli = it.next();

            // Product id
            var product = {
                product_id: pli.productID,
                quantity: pli.quantityValue,
                price: this.getFormattedPrice(
                    pli.basePrice.value.toFixed(2),
                    args.order.getCurrencyCode()
                ),
                description: pli.productName,
            };

            // Push to products array
            products.push(product);
        }

        if (this.getShippingValue(args)) {
            products.push(this.getShippingValue(args));
        }

        if (this.getTaxObject(args)) {
            products.push(this.getTaxObject(args));
        }

        return products;
    },

    /**
     * Return the tax object.
     * @param {Object} args The method arguments
     * @returns {Object} The tax data
     */
    getTaxObject: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Prepare the tax data
        var tax = {
            product_id: args.order.orderNo,
            quantity: 1,
            price: this.getFormattedPrice(
                order.getTotalTax().valueOf().toFixed(2),
                args.order.getCurrencyCode()
            ),
            description: 'Order Tax',
        };

        // Test the order
        if (order.getTotalTax().valueOf() > 0) {
            return tax;
        }
        return false;
    },

    /**
     * Return the shipping object.
     * @param {Object} args The method arguments
     * @returns {Object} The shipping data
     */
    getShippingValue: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Get shipping address object
        var shipping = order.getDefaultShipment();

        // Check if shipping cost is applicable to this order
        if (shipping.getShippingTotalPrice().valueOf() > 0) {
            var shippment = {
                product_id: shipping.getShippingMethod().getID(),
                quantity: 1,
                price: this.getFormattedPrice(shipping.adjustedShippingTotalNetPrice.value.toFixed(2), this.getCurrency(order)),
                description: shipping.getShippingMethod().getDisplayName() + ' Shipping : ' + shipping.getShippingMethod().getDescription(),
            };

            return shippment;
        }
        return null;
    },

    /**
     * Return the currency code.
     * @param {Object} order The current order
     * @returns {string} The currency code
     */
    getCurrency: function(order) {
        return order.getCurrencyCode();
    },

    /**
     * Return the order currency code.
     * @param {Object} args The method arguments
     * @returns {string} The currency code
     */
    getCurrencyCode: function(args) {
        // Get the order
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Get shipping address object
        var shipping = order.getDefaultShipment().getShippingMethod();
        var shippingCurrency = shipping.getCurrencyCode();

        return shippingCurrency;
    },

    /**
     * Get the product names.
     * @param {Object} args The method arguments
     * @returns {Array} The products list
     */
    getProductNames: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Prepare the iterator
        var it = order.productLineItems.iterator();

        // Prepare the product array
        var products = [];
        while (it.hasNext()) {
            var pli = it.next();
            products.push(pli.productName);
        }

        return products;
    },

    /**
     * Get the product price array.
     * @param {Object} args The method arguments
     * @returns {Array} The prices list
     */
    getProductPrices: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Get the product itemas
        var items = order.productLineItems.iterator();

        // Prepare the product array
        var products = [];
        while (items.hasNext()) {
            var item = items.next();
            products.push(item.getPriceValue());
        }

        return products;
    },

    /**
     * Get the product IDs.
     * @param {Object} args The method arguments
     * @returns {Array} The product ids list
     */
    getProductIds: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);
        var it = order.productLineItems.iterator();
        var productIds = [];
        while (it.hasNext()) {
            var pli = it.next();
            productIds.push(pli.productID);
        }

        return productIds;
    },

    /**
     * Get each product quantity.
     * @param {Object} args The method arguments
     * @returns {Array} The product quantities list
     */
    getProductQuantity: function(args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Prepare the iterator
        var it = order.productLineItems.iterator();

        // Loop through the items
        var productsQuantities = 0;
        while (it.hasNext()) {
            var pli = it.next();
            productsQuantities += pli.quantityValue;
        }

        return productsQuantities;
    },

    /**
     * Return an order amount.
     * @param {Object} order The order instance
     * @returns {number} The amount
     */
    getAmount: function(order) {
        var amount = this.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), order.getCurrencyCode());
        return amount;
    },

    /**
     * Return a customer full name.
     * @param {Object} args The method arguments
     * @returns {string} The customer name
     */
    getCustomerName: function(args) {
        // Load the order information
        var order = OrderMgr.getOrder(args.order.orderNo);

        // Get billing address information
        var billingAddress = order.getBillingAddress();
        var fullname = billingAddress.getFullName();

        return fullname;
    },

    /**
     * Return the capture time.
     * @returns {Object} The capture time
     */
    getCaptureTime: function() {
        // Get the current date/time in milliseconds
        var now = Date.now();

        // Get the capture time configured, or min time 0.5 minute if 0
        var configCaptureTime = this.getValue(constants.CKO_AUTO_CAPTURE_TIME);
        var captureOnMin = configCaptureTime < 2 ? 2 : configCaptureTime;

        // Convert the capture time from minutes to milliseconds
        var captureOnMs = now + (parseInt(captureOnMin) * 60000);

        // Convert the capture time to ISO 8601 format
        return new Date(captureOnMs).toISOString();
    },

    /**
     * Build a 3ds object.
     * @returns {Object} The 3ds data
     */
    get3Ds: function() {
        // 3ds object
        var treeDs = {
            enabled: this.getValue(constants.CKO_3DS),
            attempt_n3d: this.getValue(constants.CKO_N3DS),
        };

        return treeDs;
    },

    /**
     * Build a Google Pay 3ds object.
     * @returns {Object} The 3ds data
     */
    getGooglePay3Ds: function() {
        var googlePay3ds = {
            enabled: this.getValue(constants.CKO_GOOGLE_PAY_3DS),
        };

        return googlePay3ds;
    },

    /**
     * Build metadata object.
     * @param {Object} data The request data
     * @param {string} processorId The processor id
     * @returns {Object} The metadata
     */
    getMetadata: function(data, processorId) {
        // Prepare the base metadata
        var meta = {
            integration_data: this.getCartridgeMeta(),
            platform_data: this.getValue(constants.CKO_SFRA_PLATFORM_DATA),
        };

        // Add the data info if needed
        if (Object.prototype.hasOwnProperty.call(data, 'type')) {
            meta.udf1 = data.type;
        }

        // Add the payment processor to the metadata
        if (typeof (processorId) === 'object') { // eslint-disable-next-line
            processorId = processorId.getID();
        }
        meta.payment_processor = processorId;

        return meta;
    },

    getMetadataString: function(data, processorId) {
        // Prepare the base metadata
        var meta = 'integration_data' + this.getCartridgeMeta() + 'platform_data' + this.getValue(constants.CKO_SFRA_PLATFORM_DATA);

        // Add the data info if needed
        if (Object.prototype.hasOwnProperty.call(data, 'type')) {
            meta += 'udf1' + data.type;
        }

        if (typeof (processorId) === 'object') { // eslint-disable-next-line
            processorId = processorId.getID();
        }
        // Add the payment processor to the metadata
        meta += 'payment_processor' + processorId;

        return meta;
    },

    /**
     * Returns true if card is a mada card
     * @param {string} card number
     * @param {Object} config - MADA Config
     * @returns {boolean} card type
     */
    isMadaCard: function(card, config) {
        // If MADA is disabled then return fales to process MADA Payments
        // eslint-disable-next-line no-undef
        var currentLocale = request.getLocale();
        var locale = Locale.getLocale(currentLocale);
        var countryCode = locale.getCountry();

        if (!this.isMADAPaymentsEnabled() || countryCode !== 'SA') {
            return false;
        }

        if (!config || !config.type) {
            return false;
        }

        var madaBinsConfig = require('*/cartridge/config/ckoMadaConfig');
        var madaBins = madaBinsConfig[config.type] || {};
        // First 6 card number
        var cardNumber = card.slice(0, 6);
        // First card number
        var firstNumber = card.charAt(0);

        switch (firstNumber) {
            case '4':
                return madaBins.four.some(function(element) { return element === cardNumber; });
            case '5':
                return madaBins.five.some(function(element) { return element === cardNumber; });
            case '6':
                return madaBins.six.some(function(element) { return element === cardNumber; });
            case '9':
                return madaBins.nine.some(function(element) { return element === cardNumber; });
            default:
                return false;
        }
    },

    /**
     * Get the billing country.
     * @param {Object} args The method arguments
     * @returns {string} The billing country code
     */
    getBillingCountry: function(args) {
        // Get billing address information
        var country = args.order.getBillingAddress().getCountryCode().value;

        // If billingAddress country property is empty
        if (country === '') {
            // return shippingAddress country property
            country = args.order.defaultShipment.shippingAddress.countryCode.valueOf();
        }

        return country;
    },

    /**
     * Get the billing object.
     * @param {Object} args The method arguments
     * @returns {Object} The billing object
     */
    getBilling: function(args) {
        // Get billing address information
        var billingAddress = args.order.getBillingAddress();

        // Creating billing address object
        var billingDetails = {
            address_line1: billingAddress.getAddress1(),
            address_line2: billingAddress.getAddress2(),
            city: billingAddress.getCity(),
            state: billingAddress.getStateCode(),
            zip: billingAddress.getPostalCode(),
            country: billingAddress.getCountryCode().value,
        };

        // country property value is empty
        if (billingDetails.country === '') {
            // assign value from shipping address
            billingDetails.country = args.order.defaultShipment.shippingAddress.countryCode.valueOf();
        }

        return billingDetails;
    },

    /**
     * Get product quantities from a basket.
     * @param {Object} basket The basket instance
     * @returns {Array} The list of quantities
     */
    getBasketObject: function(basket) {
        var currency = basket.getCurrencyCode();
        var productsQuantities = [];
        var it = basket.productLineItems.iterator();
        while (it.hasNext()) {
            var pli = it.next();
            var productTaxRate = pli.taxRate * 100 * 100;
            var productQuantity = pli.quantityValue;
            var unitPrice = Math.round(this.getFormattedPrice(pli.adjustedGrossPrice.value.toFixed(2), currency) / productQuantity);
            var totalAmount = this.getFormattedPrice(pli.adjustedGrossPrice.value, currency);
            var products = {
                name: pli.productName,
                quantity: productQuantity.toString(),
                unit_price: unitPrice.toString(),
                tax_rate: productTaxRate.toString(),
                total_amount: totalAmount.toString(),
                total_tax_amount: this.getFormattedPrice(pli.adjustedTax.value, currency),
            };

            productsQuantities.push(products);
        }
        var shippingTaxRate = basket.defaultShipment.standardShippingLineItem.getTaxRate() * 100 * 100;
        var shipping = {
            name: basket.defaultShipment.shippingMethod.displayName + ' Shipping',
            quantity: '1',
            unit_price: this.getFormattedPrice(basket.adjustedShippingTotalGrossPrice.value, currency),
            tax_rate: shippingTaxRate.toString(),
            total_amount: this.getFormattedPrice(basket.adjustedShippingTotalGrossPrice.value, currency),
            total_tax_amount: this.getFormattedPrice(basket.adjustedShippingTotalTax.value, currency),
        };

        if (basket.shippingTotalPrice.value > 0) {
            productsQuantities.push(shipping);
        }

        return productsQuantities;
    },

    /**
     * Get product quantities from an order.
     * @param {Object} args The method arguments
     * @returns {Array} The list of quantities
     */
    getOrderBasketObject: function(args) {
        // Prepare some variables
        var currency = args.order.getCurrencyCode();
        var it = args.order.productLineItems.iterator();
        var productsQuantites = [];

        // Iterate through the products
        while (it.hasNext()) {
            var pli = it.next();
            var productTaxRate = pli.taxRate * 100 * 100;
            var productQuantity = pli.quantityValue;
            var unitPrice = Math.round(this.getFormattedPrice(pli.adjustedGrossPrice.value.toFixed(2), currency) / productQuantity);
            var totalAmount = this.getFormattedPrice(pli.adjustedGrossPrice.value, currency);
            var products = {
                name: pli.productName,
                quantity: productQuantity.toString(),
                unit_price: unitPrice.toString(),
                tax_rate: productTaxRate.toString(),
                total_amount: totalAmount.toString(),
                total_tax_amount: this.getFormattedPrice(pli.adjustedTax.value, currency),
            };

            productsQuantites.push(products);
        }

        // Set the shipping variables
        var shippingTaxRate = args.order.defaultShipment.standardShippingLineItem.getTaxRate() * 100 * 100;
        var shipping = {
            name: args.order.defaultShipment.shippingMethod.displayName + ' Shipping',
            quantity: '1',
            unit_price: this.getFormattedPrice(args.order.adjustedShippingTotalGrossPrice.value, currency),
            tax_rate: shippingTaxRate.toString(),
            total_amount: this.getFormattedPrice(args.order.adjustedShippingTotalGrossPrice.value, currency),
            total_tax_amount: this.getFormattedPrice(args.order.adjustedShippingTotalTax.value, currency),
        };

        if (args.order.shippingTotalPrice.value > 0) {
            productsQuantites.push(shipping);
        }

        return productsQuantites;
    },

    /**
     * Return the basket billing address.
     * @param {Object} basket The basket instance
     * @returns {Object} The billing address
     */
    getBasketAddress: function(basket) {
        var address = {
            given_name: basket.billingAddress.firstName,
            family_name: basket.billingAddress.lastName,
            email: null,
            title: basket.billingAddress.title,
            street_address: basket.billingAddress.address1,
            street_address2: basket.billingAddress.address2,
            postal_code: basket.billingAddress.postalCode,
            city: basket.billingAddress.city,
            phone: basket.billingAddress.phone,
            country: basket.defaultShipment.shippingAddress.countryCode.valueOf(),
        };

        return address;
    },

    /**
     * Return the order billing address.
     * @param {Object} billing The method arguments
     * @returns {Object} The billing address
     */
    getBillingAddress: function() {
        var basket = BasketMgr.getCurrentBasket();

        var address = {
            given_name: basket.billingAddress.firstName,
            family_name: basket.billingAddress.lastName,
            email: null,
            title: null,
            street_address: basket.billingAddress.address1,
            street_address2: basket.billingAddress.address2,
            postal_code: basket.billingAddress.postalCode,
            city: basket.billingAddress.city,
            phone: basket.billingAddress.phone,
            country: basket.defaultShipment.shippingAddress.countryCode.valueOf(),
        };

        return address;
    },

    /**
     * Return the order billing address.
     * @param {Object} args The method arguments
     * @returns {Object} The billing address
     */
    getOrderAddress: function(args) {
        var billingAddress = args.order.billingAddress;

        var address = {
            given_name: billingAddress.firstName,
            family_name: billingAddress.lastName,
            email: args.order.customerEmail,
            title: null,
            street_address: billingAddress.address1,
            street_address2: billingAddress.address2,
            postal_code: billingAddress.postalCode,
            city: billingAddress.city,
            phone: billingAddress.phone,
            country: billingAddress.countryCode.value,
        };

        return address;
    },

    /**
     * Rebuild the basket contents after a failed payment.
     * @param {Object} order The order
     */
    checkAndRestoreBasket: function(order) {
        var basket = BasketMgr.getCurrentOrNewBasket();
        var it;
        var pli;
        var newPLI;
        var gcit;
        var gcli;
        var newGCLI;
        var billingAddress;
        var shippingAddress;

        if (order && basket && basket.productLineItems.size() === 0 && basket.giftCertificateLineItems.size() === 0) {
            Transaction.begin();

            it = order.productLineItems.iterator();
            while (it.hasNext()) {
                pli = it.next();
                newPLI = basket.createProductLineItem(pli.productID, basket.defaultShipment);
                newPLI.setQuantityValue(pli.quantity.value);
            }

            gcit = order.giftCertificateLineItems.iterator();
            while (gcit.hasNext()) {
                gcli = it.next();
                newGCLI = basket.createGiftCertificateLineItem(gcli.priceValue, gcli.recipientEmail);

                newGCLI.setMessage(gcli.message);
                newGCLI.setRecipientName(gcli.recipientName);
                newGCLI.setSenderName(gcli.senderName);
                newGCLI.setProductListItem(gcli.productListItem);
            }

            // Handle email address
            basket.customerEmail = order.customerEmail;

            // Handle billing address
            billingAddress = basket.createBillingAddress();
            billingAddress.firstName = order.billingAddress.firstName;
            billingAddress.lastName = order.billingAddress.lastName;
            billingAddress.address1 = order.billingAddress.address1;
            billingAddress.address2 = order.billingAddress.address2;
            billingAddress.city = order.billingAddress.city;
            billingAddress.postalCode = order.billingAddress.postalCode;
            billingAddress.stateCode = order.billingAddress.stateCode;
            billingAddress.countryCode = order.billingAddress.countryCode;
            billingAddress.phone = order.billingAddress.phone;

            // Handle shipping address
            shippingAddress = basket.defaultShipment.createShippingAddress();
            shippingAddress.firstName = order.defaultShipment.shippingAddress.firstName;
            shippingAddress.lastName = order.defaultShipment.shippingAddress.lastName;
            shippingAddress.address1 = order.defaultShipment.shippingAddress.address1;
            shippingAddress.address2 = order.defaultShipment.shippingAddress.address2;
            shippingAddress.city = order.defaultShipment.shippingAddress.city;
            shippingAddress.postalCode = order.defaultShipment.shippingAddress.postalCode;
            shippingAddress.stateCode = order.defaultShipment.shippingAddress.stateCode;
            shippingAddress.countryCode = order.defaultShipment.shippingAddress.countryCode;
            shippingAddress.phone = order.defaultShipment.shippingAddress.phone;

            // Handle shipping method
            basket.defaultShipment.setShippingMethod(order.defaultShipment.getShippingMethod());

            Transaction.commit();
        }
    },
    /**
     * Check MADA Payments Enabled or not
     * @param {Object} tokenData The token data
     * @returns {Object} The gateway source
     */
    isMADAPaymentsEnabled: function() {
        return !!this.getValue(constants.CKO_MADA_PAYMENTS_ENABLED);
    },

    /**
     * Function will restore basket from session data. Used to restore records deleted in express payment scenario
     */
    restoreBasket: function() {
        var cartHelper = require('*/cartridge/scripts/cart/cartHelpers');
        var oldBasketPliRecords = session.privacy.temporaryBasketPlis;
        var productLineItem;
        if (oldBasketPliRecords) {
            oldBasketPliRecords = JSON.parse(oldBasketPliRecords);
            var currentBasket = BasketMgr.getCurrentOrNewBasket();
            try {
                Transaction.wrap(function() {
                    var productLineItems = currentBasket.getAllProductLineItems().iterator();
                    while (productLineItems.hasNext()) {
                        productLineItem = productLineItems.next();
                        currentBasket.removeProductLineItem(productLineItem);
                    }
                    Object.keys(oldBasketPliRecords).forEach(function(key) {
                        productLineItem = oldBasketPliRecords[key];
                        var options = productLineItem.options ? JSON.parse(productLineItem.options) : [];
                        cartHelper.addProductToCart(
                            currentBasket,
                            productLineItem.productID,
                            productLineItem.quantityValue,
                            [],
                            options
                        );
                    });
                });
            } catch (error) {
                Logger.error('Error While Restoring the Basket' + error);
            }
        }
        session.privacy.temporaryBasketPlis = null;
    },
};

/**
 * Module exports
 */
module.exports = ckoHelper;
