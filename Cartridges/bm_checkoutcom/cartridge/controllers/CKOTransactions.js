'use strict';

/**
 * The Checkout.com Manager transactions list. It only reads: capture, refund
 * and void are in CKOTransactionActions, a Business Manager module of its own.
 */

/* API Includes */
var ISML = require('dw/template/ISML');
var currentSite = require('dw/system/Site').getCurrent();

/* Checkout.com Helper functions */
var CKOHelper = require('*/cartridge/scripts/helpers/CKOHelper');

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
    response.setContentType('application/json');
    // eslint-disable-next-line
    response.writer.println(JSON.stringify(data));
}

/*
* Web exposed methods
*/

listTransactions.public = true;
getTransactionsData.public = true;

exports.ListTransactions = listTransactions;
exports.GetTransactionsData = getTransactionsData;
