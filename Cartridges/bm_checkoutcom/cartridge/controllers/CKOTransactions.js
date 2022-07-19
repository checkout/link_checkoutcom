'use strict';

/* API Includes */
var ISML = require('dw/template/ISML');
var currentSite = require('dw/system/Site').getCurrent();

/* Checkout.com Helper functions */
var CKOHelper = require('*/cartridge/scripts/helpers/CKOHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Get the transactions list
 */
function listTransactions() {
    // Render the template
    var startFilterYear = currentSite.getCustomPreferenceValue('ckoStartFilterYear');
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

    if (CKOHelper.getAbcOrNasEnabled().value === 'NAS' && task.value === 'capture') {
        gRequest.capture_type = 'NonFinal';
    }

    // Set the service parameter
    var serviceName = 'cko.transaction.' + task + '.' + mode + '.service';

    // Log the payment request data
    CKOHelper.log(
        CKOHelper._('cko.request.data', 'cko') + ' - ' + serviceName,
        gRequest
    );

    // Perform the request
    var gResponse = CKOHelper.getGatewayClient(
        serviceName,
        gRequest
    );

    // If Gatway response fails with 403 try alternative
    // Capture and Void Klarna Transactions
    if (gResponse === 403 && (task.value === 'capture' || task.value === 'void')) {
        // Prepare the payload
        gRequest = {
            // eslint-disable-next-line
            amount: formatedAmount, // eslint-disable-next-line
            reference: orderNumber.value, // eslint-disable-next-line
            chargeId: request.httpParameterMap.get('pid').stringValue, // eslint-disable-next-line
        };

        // eslint-disable-next-line
        if (task.value === 'capture') {
            gRequest = {
                amount: formatedAmount, // eslint-disable-next-line
                chargeId: request.httpParameterMap.get('pid').stringValue, // eslint-disable-next-line
                reference: orderNumber.value,
                type: 'klarna',
                klarna: {
                    description: CKOHelper.getValue(constants.CKO_BUSINESS_NAME) !== '' && CKOHelper.getValue(constants.CKO_BUSINESS_NAME) !== 'undefined' // eslint-disable-next-line
                        ? CKOHelper.getValue(constants.CKO_BUSINESS_NAME) : Site.getCurrent().httpHostName,
                },
            };
        }

        if (task.value !== 'refund') {
            serviceName = 'cko.klarna_transaction.' + task + '.' + mode + '.service';
        }


        // Perform the request
        gResponse = CKOHelper.getGatewayClient(
            serviceName,
            gRequest
        );
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
