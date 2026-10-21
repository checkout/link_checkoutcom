'use strict';

/* API Includes */
var CSRFProtection = require('dw/web/CSRFProtection');
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

/** The actions the console may request. */
var TASKS = ['capture', 'refund', 'void'];

/**
 * Answer an action request.
 * @param {number} status The HTTP status
 * @param {*} body The JSON body: the accepted gateway response, or false
 */
function respond(status, body) {
    // eslint-disable-next-line
    response.setStatus(status);
    // eslint-disable-next-line
    response.writer.println(JSON.stringify(body));
}

/**
 * Perform a capture, void or refund for the console. Money moves, so the request
 * must be a POST from the console page itself (CSRF token).
 */
function remoteCall() {
    // eslint-disable-next-line
    if (request.getHttpMethod() !== 'POST' || !CSRFProtection.validateRequest()) {
        respond(403, false);

        return;
    }

    // Get the operating mode
    var mode = CKOHelper.getValue(constants.CKO_MODE);

    // Get the transaction task
    // eslint-disable-next-line
    var task = request.httpParameterMap.get('task');

    if (TASKS.indexOf(task.stringValue) === -1) {
        respond(400, false);

        return;
    }

    // eslint-disable-next-line
    var requestedAmount = parseFloat(request.httpParameterMap.get('amount').stringValue);

    if (task.stringValue !== 'void' && !(requestedAmount > 0)) {
        respond(400, false);

        return;
    }

    // Get the transaction currency
    // eslint-disable-next-line
    var currency = request.httpParameterMap.get('currency').stringValue;

    // Get the transaction formated amount
    // eslint-disable-next-line
    var formatedAmount = CKOHelper.getFormattedPrice(request.httpParameterMap.get('amount').stringValue, currency);

    // Get the order number
    // eslint-disable-next-line
    var orderNumber = request.httpParameterMap.get('orderNo');

    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(orderNumber);

    // Block capture and void for Alma and ACH orders
    if (order && (task.value === 'capture' || task.value === 'void')) {
        var instruments = order.getPaymentInstruments().toArray();
        if (instruments.length > 0) {
            var paymentMethod = instruments[0].getPaymentMethod();
            if (paymentMethod === 'CHECKOUTCOM_ALMA') {
                // eslint-disable-next-line
                response.writer.println(JSON.stringify({ error: true, message: 'Capture and Void are not supported for Alma payments.' }));
                return;
            }
            if (paymentMethod === 'CHECKOUTCOM_TAMARA') {
                // eslint-disable-next-line
                response.writer.println(JSON.stringify({ error: true, message: 'Capture and Void are not supported for Tamara payments.' }));
                return;
            }
            if (paymentMethod === 'CHECKOUTCOM_ACH') {
                // eslint-disable-next-line
                response.writer.println(JSON.stringify({ error: true, message: 'Capture and Void are not supported for ACH Direct Debit payments.' }));
                return;
            }
            if (paymentMethod === 'CHECKOUTCOM_ALIPAYHK') {
                // eslint-disable-next-line
                response.writer.println(JSON.stringify({ error: true, message: 'Capture and Void are not supported for AlipayHK payments.' }));
                return;
            }
            if (paymentMethod === 'CHECKOUTCOM_ALIPAYCN') {
                // eslint-disable-next-line
                response.writer.println(JSON.stringify({ error: true, message: 'Capture and Void are not supported for AlipayCN payments.' }));
                return;
            }
        }
    }

    // Block void for Sequra orders (void is not applicable for Sequra)
    if (order && task.value === 'void') {
        var sequraInstruments = order.getPaymentInstruments().toArray();
        if (sequraInstruments.length > 0 && sequraInstruments[0].getPaymentMethod() === 'CHECKOUTCOM_SEQURA') {
            // eslint-disable-next-line
            response.writer.println(JSON.stringify({ error: true, message: 'Void is not supported for Sequra payments.' }));
            return;
        }
    }

    // Prepare the payload
    var gRequest = {
        // eslint-disable-next-line
        amount: formatedAmount, // eslint-disable-next-line
        reference: orderNumber.value, // eslint-disable-next-line
        chargeId: request.httpParameterMap.get('pid').stringValue,
        service: order ? order.custom.orderProcessedByABCorNAS : '',
    };

    if (CKOHelper.getNasEnabled().value === 'NAS' && task.value === 'capture') {
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
            service: order ? order.custom.orderProcessedByABCorNAS : '',
        };

        // eslint-disable-next-line
        if (task.value === 'capture') {
            gRequest = {
                amount: formatedAmount, // eslint-disable-next-line
                chargeId: request.httpParameterMap.get('pid').stringValue, // eslint-disable-next-line
                reference: orderNumber.value,
                type: 'klarna',
                service: order ? order.custom.orderProcessedByABCorNAS : '',
                klarna: {
                    description: CKOHelper.getValue(constants.CKO_BUSINESS_NAME) !== '' && CKOHelper.getValue(constants.CKO_BUSINESS_NAME) !== 'undefined' // eslint-disable-next-line
                        ? CKOHelper.getValue(constants.CKO_BUSINESS_NAME) : currentSite.httpHostName,
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

    // Accepted only with an action id: a failure returns an error code (or an
    // { error } object), which must not read as success in the console
    var accepted = !!gResponse && typeof gResponse === 'object' && !!gResponse.action_id;

    respond(200, accepted ? gResponse : false);
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
