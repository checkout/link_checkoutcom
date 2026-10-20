'use strict';

/* API Includes */
var ISML = require('dw/template/ISML');

/* Checkout.com Helper functions */
var CKOHelper = require('*/cartridge/scripts/helpers/CKOHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Get the transactions list
 */
function listTransactions() {
    // Render the template
    var startFilterYear = String(new Date().getFullYear() - constants.CKO_FILTER_YEARS_BACK);
    ISML.renderTemplate('transactions/list', { startFilterYear: startFilterYear });
}

/**
 * Get the transactions table data
 */
function getTransactionsData() {
    // Prepare the output array
    var data = CKOHelper.getCkoTransactions();

    // Send the AJAX response
    // eslint-disable-next-line
    response.writer.println(JSON.stringify(data));
}

/**
 * Perform a remote Hub Call
 */
function remoteCall() {
    // Get the operating mode
    var mode = CKOHelper.getValue(constants.CKO_MODE);

    // Get the transaction task
    // eslint-disable-next-line
    var task = request.httpParameterMap.get('task');

    // Get the transaction currency
    // eslint-disable-next-line
    var currency = request.httpParameterMap.get('currency').stringValue;

    // Get the transaction formated amount
    // eslint-disable-next-line
    var formatedAmount = CKOHelper.getFormattedPrice(request.httpParameterMap.get('amount').stringValue, currency);

    // Get the order number
    // eslint-disable-next-line
    var orderNumber = request.httpParameterMap.get('orderNo');


    // Prepare the payload
    var gRequest = {
        // eslint-disable-next-line
        amount: formatedAmount, // eslint-disable-next-line
        reference: orderNumber.value, // eslint-disable-next-line
        chargeId: request.httpParameterMap.get('pid').stringValue,
    };

    // Allow further partial captures after this one
    if (task.value === 'capture') {
        gRequest.capture_type = 'NonFinal';
    }

    // Set the service parameter
    var serviceName = 'cko.transaction.' + task + '.' + mode + '.service';

    // Log the payment request data
    CKOHelper.log(
        CKOHelper._('cko.request.data', 'cko') + ' - ' + serviceName,
        gRequest
    );

    var Logger = require('dw/system/Logger');
    var log = Logger.getLogger('checkoutcom');
    var paymentId = gRequest.chargeId;

    log.info('Business Manager {0} requested: order {1}, payment {2}, amount {3} {4}.', task.value, orderNumber.value, paymentId, request.httpParameterMap.get('amount').stringValue, currency);

    // Perform the request
    var gResponse = CKOHelper.getGatewayClient(
        serviceName,
        gRequest
    );

    if (gResponse && typeof gResponse === 'object' && gResponse.action_id) {
        log.info('Business Manager {0} accepted by Checkout.com: order {1}, payment {2}, action {3}.', task.value, orderNumber.value, paymentId, gResponse.action_id);
    } else {
        log.warn('Business Manager {0} failed: order {1}, payment {2}, response {3}.', task.value, orderNumber.value, paymentId, JSON.stringify(gResponse));
    }


    // Return the response
    // eslint-disable-next-line
    response.writer.println(JSON.stringify(gResponse));
}
/*
* Web exposed methods
*/

listTransactions.public = true;
getTransactionsData.public = true;
remoteCall.public = true;

exports.ListTransactions = listTransactions;
exports.GetTransactionsData = getTransactionsData;
exports.RemoteCall = remoteCall;
