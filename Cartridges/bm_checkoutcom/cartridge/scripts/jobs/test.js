'use strict'

/* API Includes */
var SystemObjectMgr = require('dw/object/SystemObjectMgr');
var Calendar = require('dw/util/Calendar');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var StringUtils = require('dw/util/StringUtils');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger').getLogger('ProcessOut', 'processoutHelper');
var Money = require('dw/value/Money');

// Custom code includes
var processOutCurrencyConfig = require('*/cartridge/scripts/config/processOutCurrencyConfig');
var sensitiveDataHelper = require('*/cartridge/scripts/helpers/sensitiveDataHelper.js');
var CartUtils = require('app_lora/cartridge/scripts/cart/CartUtils');
var totalPages;

function test() {
    // Query the orders
    var result = OrderMgr.searchOrders('', 'creationDate desc');

    while (result.hasNext()) {
        var pi = result.next();
        var piLength = pi.paymentInstruments.length - 1 ;
        if (pi.paymentTransaction.paymentProcessor 
            && pi.paymentTransaction.paymentProcessor.ID.indexOf('CHECKOUTCOM_') != -1) {
           Transaction.wrap(function() {
               pi.custom.isCheckoutOrder = true;
           });
        }

        if (!result.hasNext()) {
            var queryDate = StringUtils.formatCalendar(new Calendar(pi.creationDate), "yyyy-MM-dd'T'HH:mm:ss'+Z'");
            var queryString = 'creationDate <= ' + queryDate;
            result = OrderMgr.searchOrders(queryString, 'creationDate desc');
        }
    }
}

module.exports = {test: test};