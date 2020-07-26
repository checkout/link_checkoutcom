"use strict"

/* API Includes */
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var SystemObjectMgr = require('dw/object/SystemObjectMgr');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');

/* Card Currency Config */
var ckoCurrencyConfig = require('~/cartridge/scripts/config/ckoCurrencyConfig');

/**
 * Utility functions.
 */
var ckoHelper = {
    /**
     * Get a failed payment error message.
     * @returns {string} The message string
     */
    getPaymentFailureMessage: function () {
        return Resource.msg('cko.transaction.failedMessage1', 'cko', null)
        + ' ' + Resource.msg('cko.transaction.failedMessage2', 'cko', null);
    },

    /**
     * Get a failed order error message.
     * @returns {string} The message string
     */
    getOrderFailureMessage: function () {
        return Resource.msg('cko.transaction.failedMessage1', 'cko', null)
        + ' ' + Resource.msg('cko.transaction.failedMessage3', 'cko', null);
    },


    /**
     * Get user language.
     * @returns {string} The user language code
     */
    getLanguage: function () {
        return request.locale.replace('_', '-');
    },

    /**
     * Get the site name.
     * @returns {string} The site name
     */
    getSiteName: function () {
        return Site.getCurrent().name;
    },

    /**
     * Get the site hostname.
     * @returns {string} The site host name
     */
    getSiteHostName: function () {
        return Site.getCurrent().httpHostName;
    },

    /**
     * Check if the gateway response is valid.
     * @param {Object} req The HTTP response data
     */
    isValidResponse: function (req) {
        var requestKey = req.httpHeaders['authorization'];
        var privateSharedKey = this.getAccountKeys().privateSharedKey;

        return requestKey == privateSharedKey;
    },

    /**
     * Get value from custom preferences.
     * @param {string} field The field id
     * @returns {string} The preference value
     */
    getValue: function (field) {
        return Site.getCurrent().getCustomPreferenceValue(field);
    },

    /**
     * Get the site country code from locale.
     * @returns {string} The site  country code
     */
    getSiteCountryCode: function () {
        return Site.getCurrent().defaultLocale.split('_')[1];
    },

    /**
     * Handles string translation with language resource files.
     * @param {string} strValue The string value
     * @param {string} strFile The file name
     * @returns {string} The translated string value
     */
    _: function (strValue, strFile) {
        return Resource.msg(strValue, strFile, null);
    },

    /**
     * Write gateway information to the website's custom log file.
     * @param {string} dataType The data type
     * @param {Object} gatewayData The gateway data
     */
    log: function (dataType, gatewayData) {
        if (this.getValue('ckoDebugEnabled') == true) {
            // Get the logger
            var logger = Logger.getLogger('ckodebug');

            // Remove sensitive data
            gatewayData = this.removeSentisiveData(gatewayData);

            // Log the data
            if (logger) {
                logger.debug(
                    dataType + ' : {0}',
                    JSON.stringify(gatewayData)
                );
            }
        }
    },

    /**
     * Remove sentitive data from the logs.
     * @param {Object} data The log data
     */
    removeSentisiveData: function (data) {
        // Card data
        if (Object.prototype.hasOwnProperty.call(data, 'source')) {
           if (Object.prototype.hasOwnProperty.call(data.source, 'number')) data.source.number.replace(/^.{14}/g, '*');
           if (Object.prototype.hasOwnProperty.call(data.source, 'cvv')) data.source.cvv.replace(/^.{3}/g, '*');
           if (Object.prototype.hasOwnProperty.call(data.source, 'billing_address')) delete data.source.billing_address;
           if (Object.prototype.hasOwnProperty.call(data.source, 'phone')) delete data.source.phone;
           if (Object.prototype.hasOwnProperty.call(data.source, 'name')) delete data.source.name;
        }

        // Customer data
        if (Object.prototype.hasOwnProperty.call(data, 'customer')) delete data.customer;
        if (Object.prototype.hasOwnProperty.call(data, 'shipping')) delete data.shipping;
        if (Object.prototype.hasOwnProperty.call(data, 'billing')) delete data.billing;

        return data;
    },

    /**
     * Return an order id.
     * @returns {string} The order id
     */
    getOrderId: function () {
        var orderId = (this.getValue('cko3ds')) ? request.httpParameterMap.get('reference').stringValue : request.httpParameterMap.get('reference').stringValue;
        if (orderId === null) {
            orderId = session.privacy.ckoOrderId;
        }

        return orderId;
    },

    /**
     * Get the cartridge metadata.
     * @returns {string} The platform data
     */
    getCartridgeMeta: function () {
        return this.getValue("ckoSfraPlatformData");
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
    getAccountKeys: function () {
        var keys = {};
        var str = this.getValue('ckoMode') == 'live' ? 'Live' : 'Sandbox';

        keys.publicKey = this.getValue('cko' + str + 'PublicKey');
        keys.secretKey = this.getValue('cko' +  str + 'SecretKey');
        keys.privateSharedKey = this.getValue('cko' +  str + 'PrivateSharedKey');

        return keys;
    },

    /**
     * Create an HTTP client to handle request to gateway.
     * @param {string} serviceId The service id
     * @param {Object} requestData The request data
     * @param {string} method The HTTP request method
     * @returns {Object} The HTTP response object
     */
    gatewayClientRequest: function (serviceId, requestData, method) {
        var method = method || 'POST';
        var serv = this.getService(serviceId);

        // Prepare the request URL and data
        if (Object.prototype.hasOwnProperty.call(requestData, 'chargeId')) {
            var requestUrl = serv.getURL().replace('chargeId', requestData.chargeId);
            serv.setURL(requestUrl);
            delete requestData['chargeId'];
        }

        // Set the request method
        serv.setRequestMethod(method);

        // Call the service
        var resp = serv.call(requestData);
        if (resp.status != 'OK') {
            return resp.error;
        }

        return resp.object;
    },

    /**
     * Get an HTTP service.
     * @param {string} serviceId The service id
     * @returns {Object} The HTTP service instance
     */
    getService: function (serviceId) {
        var parts  =  serviceId.split('.');
        var entity = parts[1];
        var action = parts[2];
        var mode = parts[3];
        var svcFile = entity + action.charAt(0).toUpperCase() + action.slice(1);
        var svcClass = require('~/cartridge/scripts/services/' + svcFile);

        return svcClass[mode]();
    },

    /**
     * Currency conversion mapping.
     * @param {string} currency The currency code
     */
    getCkoFormatedValue: function (currency) {
        if (ckoCurrencyConfig.x1.currencies.match(currency)) {
            return ckoCurrencyConfig.x1.multiple;
        } else if (ckoCurrencyConfig.x1000.currencies.match(currency)) {
            return ckoCurrencyConfig.x1000.multiple;
        } else {
            return 100;
        }
    },

    /**
     * Format a price for a gateway request.
     * @param {number} price The price to format
     * @param {string} currency The currency code
     */
    getFormattedPrice: function (price, currency) {
        var ckoFormateBy = this.getCkoFormatedValue(currency);
        var orderTotalFormated = price * ckoFormateBy;

        return orderTotalFormated.toFixed();
    },

    /**
     * Get the Checkout.com orders.
     * @param {string} orderNo The order number
     * @returns {Array} The list of orders
     */
    getOrders: function (orderNo) {
        // Prepare the output array
        var data = [];

        // Query the orders
        var result  = SystemObjectMgr.querySystemObjects('Order', 'orderNo = {0}', 'creationDate desc', orderNo);

        // Loop through the results
        while (result.hasNext()) {
            // Get the payment instruments
            var item = result.next();
            var paymentInstruments = item.getPaymentInstruments();

            // Loop through the payment instruments
            for (var i = 0; i < paymentInstruments.length; i++) {
                if (this.isCkoItem(paymentInstruments[i].paymentMethod) && !this.containsObject(item, data)) {
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
     */
    containsObject: function (obj, list) {
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
            name: order.customerName
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
            number: billingAddress.getPhone()
        };
    },

    /**
     * Strip spaces form number.
     */
    getFormattedNumber: function (num) {
        return num.toString().replace(/\s/g, '');
    },

    /**
     * Build the shipping data.
     */
    getShipping: function (order) {
        // Get shipping address
        var shippingAddress = order.getDefaultShipment().getShippingAddress();

        // Create the address data
        var shippingDetails = {
            address_line1       : shippingAddress.getAddress1(),
            address_line2       : shippingAddress.getAddress2(),
            city                : shippingAddress.getCity(),
            state               : shippingAddress.getStateCode(),
            zip                 : shippingAddress.getPostalCode(),
            country             : shippingAddress.getCountryCode().value
        };

        // Build the shipping data
        var shipping = {
            address             : shippingDetails,
            phone               : this.getPhone(order.billingAddress)
        };

        return shipping;
    },

    /**
     * Confirm is a payment is valid from API response code.
     */
    paymentSuccess: function (gatewayResponse) {
        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'response_code')) {
            return gatewayResponse.response_code == "10000"
            || gatewayResponse.response_code == '10100'
            || gatewayResponse.response_code == '10200';
        }

        return false;
    },

    /**
     * Confirm is a payment is valid from API redirect response code.
     */
    redirectPaymentSuccess: function (gatewayResponse) {
      if (Object.prototype.hasOwnProperty.call(gatewayResponse, 'actions')) {
          return gatewayResponse
          && (gatewayResponse.actions[0].response_code == "10000"
          || gatewayResponse.actions[0].response_code == '10100'
          || gatewayResponse.actions[0].response_code == '10200');
      }

      if (Object.prototype.hasOwnProperty.call(gatewayResponse, 'type') && gatewayResponse.source.type == 'sofort') {
          return true;
      }

      return false;
    },

    /**
     * Write the order information to session for the current shopper.
     */
    updateCustomerData: function (gatewayResponse) {
        if ((gatewayResponse) && Object.prototype.hasOwnProperty.call(gatewayResponse, 'card')) {
            Transaction.wrap(function () {
                if (session.customer.profile !== null) {
                    session.customer.profile.custom.ckoCustomerId = gatewayResponse.card.customerId;
                }
            });
        }
    },

    /**
     * Get the basket quantities.
     */
    getQuantity : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);
        var quantity = order.getProductQuantityTotal();

        return quantity;
    },

    /**
     * Get the billing descriptor object from custom preferences.
     */
    getBillingDescriptor : function () {
        var billingDescriptor = {
            "name"  : this.getValue('ckoBillingDescriptor1'),
            "city"  : this.getValue('ckoBillingDescriptor2')
        }

        return billingDescriptor;
    },

    /**
     * Get the products information.
     */
    getProductInformation : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);
        var it = order.productLineItems.iterator();
        var products = [];

        // Loop through the itemd
        while (it.hasNext()) {
            var pli = it.next();

            // Product id
            var product = {
                "product_id"    : pli.productID,
                "quantity"      : pli.quantityValue,
                "price"         : this.getFormattedPrice(
                    pli.adjustedPrice.value.toFixed(2),
                    args.order.getCurrencyCode()
                ),
                "description"   : pli.productName
            }

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
     */
    getTaxObject : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);

        // Prepare the tax data
        var tax = {
            "product_id"    : args.orderNo,
            "quantity"      : 1,
            "price"         : this.getFormattedPrice(
                order.getTotalTax().valueOf().toFixed(2),
                args.order.getCurrencyCode()
            ),
            "description"   : "Order Tax"
        }

        // Test the order
        if (order.getTotalTax().valueOf() > 0) {
            return tax;
        } else {
            return false;
        }
    },

    /**
     * Return the shipping object.
     */
    getShippingValue : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);

        // Get shipping address object
        var shipping = order.getDefaultShipment();

        // Check if shipping cost is applicable to this order
        if (shipping.getShippingTotalPrice().valueOf() > 0) {
            var shippment = {
                "product_id"    : shipping.getShippingMethod().getID(),
                "quantity"      : 1,
                "price"         : this.getFormattedPrice(shipping.adjustedShippingTotalPrice.value.toFixed(2), this.getCurrency()),
                "description"   : shipping.getShippingMethod().getDisplayName() + " Shipping : " + shipping.getShippingMethod().getDescription()
            }

            return shippment;
        } else {
            return false;
        }
    },

    /**
     * Return the order currency code.
     */
    getCurrencyCode: function (args) {
        // Get the order
        var order = OrderMgr.getOrder(args.orderNo);

        // Get shipping address object
        var shipping = order.getDefaultShipment().getShippingMethod();
        var shippingCurrency = shipping.getCurrencyCode();

        return shippingCurrency;
    },

    /**
     * Get the product names.
     */
    getProductNames : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);

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
     */
    getProductPrices : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);

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
     */
    getProductIds : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);
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
     */
    getProductQuantity : function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);

        // Prepare the iterator
        var it = order.productLineItems.iterator();

        // Loop through the items
        var products_quantites = 0;
        while (it.hasNext()) {
            var pli = it.next();
            products_quantites += pli.quantityValue;
        }

        return products_quantites;
    },

    /**
     * Return order amount.
     */
    getAmount: function (order) {
        var amount = this.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), order.getCurrencyCode());
        return amount;
    },

    /**
     * Return Customer FullName.
     */
    getCustomerName: function (args) {
        // Load the order information
        var order = OrderMgr.getOrder(args.orderNo);

        // Get billing address information
        var billingAddress = order.getBillingAddress();
        var fullname = billingAddress.getFullName();

        return fullname;
    },

    /**
     * Return capture time.
     */
    getCaptureTime: function () {
        // Get the current date/time in milliseconds
        var now = Date.now();

        // Get the capture time configured, or min time 0.5 minute if 0
        var configCaptureTime = this.getValue('ckoAutoCaptureTime');
        var captureOnMin = configCaptureTime > 0 ? configCaptureTime : 0.5;

        // Convert the capture time from minutes to milliseconds
        var captureOnMs = now + parseInt(captureOnMin) * 60000;

        // Convert the capture time to ISO 8601 format
        return new Date(captureOnMs).toISOString();
    },

    /**
     * Build 3ds object.
     */
    get3Ds: function () {
        // 3ds object
        var ds = {
            "enabled" : this.getValue('cko3ds'),
            "attempt_n3d" : this.getValue('ckoN3ds')
        }

        return ds;
    },

    /**
     * Build metadata object.
     */
    getMetadata: function (data, processorId) {
        // Prepare the base metadata
        var meta = {
            integration_data: this.getCartridgeMeta(),
            platform_data: this.getValue('ckoSfraPlatformData')
        }

        // Add the data info if needed
        if (Object.prototype.hasOwnProperty.call(data, 'type')) {
            meta.udf1 = data.type;
        }

        // Add the payment processor to the metadata
        meta.payment_processor = processorId;

        return meta;
    },

    /**
     * Get Billing Country.
     */
    getBillingCountry: function (args) {
        // Load the card and order information
        var order = OrderMgr.getOrder(args.orderNo);

        // Get billing address information
        var billingAddress = order.getBillingAddress();
        var country = billingAddress.getCountryCode().value

        return country;
    },

    // Build the Billing object
    getBilling: function (args) {
        // Get billing address information
        var billingAddress = args.order.getBillingAddress();

        // Creating billing address object
        var billingDetails = {
            address_line1       : billingAddress.getAddress1(),
            address_line2       : billingAddress.getAddress2(),
            city                : billingAddress.getCity(),
            state               : billingAddress.getStateCode(),
            zip                 : billingAddress.getPostalCode(),
            country             : billingAddress.getCountryCode().value
        };

        return billingDetails;
    },

    /**
     * Return Basket Item object.
     */
    getBasketObject: function (basket) {
        var currency = basket.getCurrencyCode();
        var products_quantites = [];
        var it = basket.productLineItems.iterator();
        while (it.hasNext()) {
            var pli = it.next();
            var productTaxRate = pli.taxRate * 100 * 100;
            var productQuantity = pli.quantityValue;
            var unitPrice = Math.round(this.getFormattedPrice(pli.adjustedGrossPrice.value.toFixed(2), currency) / productQuantity);
            var totalAmount = this.getFormattedPrice(pli.adjustedGrossPrice.value, currency);
            var products = {
                "name"              : pli.productName,
                "quantity"          : productQuantity.toString(),
                "unit_price"        : unitPrice.toString(),
                "tax_rate"          : productTaxRate.toString(),
                "total_amount"      : totalAmount.toString(),
                "total_tax_amount"  : this.getFormattedPrice(pli.adjustedTax.value, currency)
            }

            products_quantites.push(products);
        }
        var shippingTaxRate = basket.defaultShipment.standardShippingLineItem.getTaxRate() * 100 * 100;
        var shipping = {
            "name"              : basket.defaultShipment.shippingMethod.displayName + " Shipping",
            "quantity"          : '1',
            "unit_price"        : this.getFormattedPrice(basket.shippingTotalGrossPrice.value, currency),
            "tax_rate"          : shippingTaxRate.toString(),
            "total_amount"      : this.getFormattedPrice(basket.shippingTotalGrossPrice.value, currency),
            "total_tax_amount"  : this.getFormattedPrice(basket.shippingTotalTax.value, currency)
        }

        if (basket.shippingTotalPrice.value > 0) {
            products_quantites.push(shipping);
        }

        return products_quantites;
    },

    /**
     * Return Basket Item object.
     */
    getOrderBasketObject: function (args) {
        // Prepare some variables
        var currency = args.order.getCurrencyCode();
        var it = args.order.productLineItems.iterator();
        var products_quantites = [];

        // Iterate through the products
        while (it.hasNext()) {
            var pli = it.next();
            var productTaxRate = pli.taxRate * 100 * 100;
            var productQuantity = pli.quantityValue;
            var unitPrice = Math.round(this.getFormattedPrice(pli.adjustedGrossPrice.value.toFixed(2), currency) / productQuantity);
            var totalAmount = this.getFormattedPrice(pli.adjustedGrossPrice.value, currency);
            var products = {
                "name"              : pli.productName,
                "quantity"          : productQuantity.toString(),
                "unit_price"        : unitPrice.toString(),
                "tax_rate"          : productTaxRate.toString(),
                "total_amount"      : totalAmount.toString(),
                "total_tax_amount"  : this.getFormattedPrice(pli.adjustedTax.value, currency)
            }

            products_quantites.push(products);
        }

        // Set the shipping variables
        var shippingTaxRate = args.order.defaultShipment.standardShippingLineItem.getTaxRate() * 100 * 100;
        var shipping = {
            "name"              : args.order.defaultShipment.shippingMethod.displayName + " Shipping",
            "quantity"          : '1',
            "unit_price"        : this.getFormattedPrice(args.order.shippingTotalGrossPrice.value, currency),
            "tax_rate"          : shippingTaxRate.toString(),
            "total_amount"      : this.getFormattedPrice(args.order.shippingTotalGrossPrice.value, currency),
            "total_tax_amount"  : this.getFormattedPrice(args.order.shippingTotalTax.value, currency)
        }

        if (args.order.shippingTotalPrice.value > 0) {
            products_quantites.push(shipping);
        }

        return products_quantites;
    },

    /**
     * Return the basket billing address.
     */
    getBasketAddress: function (basket) {
        var address = {
            given_name                  : basket.billingAddress.firstName,
            family_name                 : basket.billingAddress.lastName,
            email                       : null,
            title                       : basket.billingAddress.title,
            street_address              : basket.billingAddress.address1,
            street_address2             : basket.billingAddress.address2,
            postal_code                 : basket.billingAddress.postalCode,
            city                        : basket.billingAddress.city,
            phone                       : basket.billingAddress.phone,
            country                     : basket.defaultShipment.shippingAddress.countryCode.valueOf()
        }

        return address;
    },

    /**
     * Return the order billing address.
     */
    getOrderAddress: function (args) {
        var address = {
            given_name                  : args.order.defaultShipment.shippingAddress.firstName,
            family_name                 : args.order.defaultShipment.shippingAddress.lastName,
            email                       : args.order.customerEmail,
            title                       : args.order.defaultShipment.shippingAddress.title,
            street_address              : args.order.defaultShipment.shippingAddress.address1,
            street_address2             : args.order.defaultShipment.shippingAddress.address2,
            postal_code                 : args.order.defaultShipment.shippingAddress.postalCode,
            city                        : args.order.defaultShipment.shippingAddress.city,
            phone                       : args.order.defaultShipment.shippingAddress.phone,
            country                     : args.order.defaultShipment.shippingAddress.countryCode.valueOf()
        }

        return address;
    }
}

/**
 * Module exports
 */
module.exports = ckoHelper;
