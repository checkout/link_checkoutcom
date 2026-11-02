'use strict';

/**
 * Capture, refund and void from the Checkout.com Manager console. Money moves,
 * so this controller is its own Business Manager module (bm_extensions.xml,
 * menu action checkoutcom_transaction_actions): a role needs that module to use
 * these actions.
 *
 * Nothing about the payment is taken from the request but the order number,
 * the action and its amount: the payment and currency come from the order, and
 * the amount is capped at what is still available for the payment (its balances
 * on Checkout.com, else the order's own captures and refunds).
 */

/* API Includes */
var CSRFProtection = require('dw/web/CSRFProtection');
var Logger = require('dw/system/Logger');
var currentSite = require('dw/system/Site').getCurrent();

/* Checkout.com Helper functions */
var CKOHelper = require('*/cartridge/scripts/helpers/CKOHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/** The actions the console may request. */
var TASKS = ['capture', 'refund', 'void'];

/**
 * Answer an action request.
 * @param {number} status The HTTP status
 * @param {*} body The JSON body: the accepted gateway response, or false / an error
 */
function respond(status, body) {
    // eslint-disable-next-line
    response.setStatus(status);
    // eslint-disable-next-line
    response.writer.println(JSON.stringify(body));
}

/**
 * Whether the order was paid with a card: the card, Apple Pay and Google Pay
 * methods, or a Flow payment whose recorded source is a card.
 * @param {dw.order.Order} order The order
 * @returns {boolean} True for a card payment; false when unknown
 */
function isCardOrder(order) {
    var instruments = order.getPaymentInstruments().toArray();

    return instruments.some(function(instrument) {
        var method = instrument.getPaymentMethod();

        if (method === 'CHECKOUTCOM_CARD' || method === 'CHECKOUTCOM_APPLE_PAY' || method === 'CHECKOUTCOM_GOOGLE_PAY') {
            return true;
        }

        if (method === 'CHECKOUTCOM_FLOW' && instrument.custom.ckoPaymentData) {
            try {
                return JSON.parse(instrument.custom.ckoPaymentData).type === 'card';
            } catch (e) {
                return false;
            }
        }

        return false;
    });
}

/**
 * Visa and Mastercard Level 2 data for a capture of a card payment: the order
 * number, and the order's tax and shipping when the whole order is captured
 * (they would not be true for part of it). Other methods get none.
 * @param {dw.order.Order} order The order
 * @param {string|number} amount The capture amount, in Checkout.com's format
 * @param {string} currency The currency
 * @returns {Object|null} processing.order_id, tax_amount and shipping_amount
 */
function levelTwoProcessing(order, amount, currency) {
    if (!order || !isCardOrder(order)) {
        return null;
    }

    var processing = {};
    var minor = function(money) {
        return money && money.isAvailable() ? Number(CKOHelper.getFormattedPrice(String(money.getValue()), currency)) : null;
    };

    if (String(order.getOrderNo()).length <= 15) {
        processing.order_id = String(order.getOrderNo());
    }

    if (minor(order.getTotalGrossPrice()) === Number(amount)) {
        var tax = minor(order.getTotalTax());
        var shipping = minor(order.getAdjustedShippingTotalPrice());

        if (tax !== null) {
            processing.tax_amount = tax;
        }

        if (shipping !== null) {
            processing.shipping_amount = shipping;
        }
    }

    return Object.keys(processing).length > 0 ? processing : null;
}

/**
 * Perform a capture, void or refund for the console. The request must be a POST
 * from the console page itself (CSRF token), from a user whose role has this
 * module; the payment and currency come from the order, and the amount may not
 * exceed what is still available for the payment.
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

    // Get the order number
    // eslint-disable-next-line
    var orderNumber = request.httpParameterMap.get('orderNo');

    var OrderMgr = require('dw/order/OrderMgr');
    var order = orderNumber.stringValue ? OrderMgr.getOrder(orderNumber.stringValue) : null;

    if (!order) {
        respond(404, { error: 'no_order' });

        return;
    }

    // The order's own Checkout.com payment, in the order's currency: never values from the request
    var paymentId = CKOHelper.getOrderPaymentId(order);
    var currency = order.getCurrencyCode();

    if (!paymentId) {
        respond(409, { error: 'no_payment' });

        return;
    }

    // Get the transaction formated amount
    // eslint-disable-next-line
    var formatedAmount = CKOHelper.getFormattedPrice(request.httpParameterMap.get('amount').stringValue, currency);

    // What can still be captured, refunded or voided, in minor units
    var limit = CKOHelper.getAvailableAmount(order, paymentId, task.stringValue);

    if (limit === null) {
        respond(502, { error: 'balances_unavailable' });

        return;
    }

    if (task.stringValue === 'void' ? limit <= 0 : Number(formatedAmount) > limit) {
        Logger.getLogger('checkoutcom').warn('Business Manager {0} refused for order {1}: exceeds the available {2}.', task.stringValue, order.getOrderNo(), limit);
        respond(422, { error: 'exceeds_available', limit: limit });

        return;
    }

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
        chargeId: paymentId,
        service: order ? order.custom.orderProcessedByABCorNAS : '',
    };

    if (CKOHelper.getNasEnabled().value === 'NAS' && task.value === 'capture') {
        gRequest.capture_type = 'NonFinal';

        var processing = levelTwoProcessing(order, formatedAmount, currency);

        if (processing) {
            gRequest.processing = processing;
        }
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
            chargeId: paymentId, // eslint-disable-next-line
            service: order ? order.custom.orderProcessedByABCorNAS : '',
        };

        // eslint-disable-next-line
        if (task.value === 'capture') {
            gRequest = {
                amount: formatedAmount, // eslint-disable-next-line
                chargeId: paymentId, // eslint-disable-next-line
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

remoteCall.public = true;

exports.RemoteCall = remoteCall;
