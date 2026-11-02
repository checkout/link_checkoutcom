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
    response.setContentType('application/json');
    // eslint-disable-next-line
    response.writer.println(JSON.stringify(body));
}

/** Capture and void are not supported for these methods; void not for Sequra. */
var NO_CAPTURE_OR_VOID = {
    CHECKOUTCOM_ALMA: 'Alma',
    CHECKOUTCOM_TAMARA: 'Tamara',
    CHECKOUTCOM_ACH: 'ACH Direct Debit',
    CHECKOUTCOM_ALIPAYHK: 'AlipayHK',
    CHECKOUTCOM_ALIPAYCN: 'AlipayCN',
};

/**
 * Whether the console's amount is a plain decimal ("12.34") of at least one
 * minor unit: never "5abc", "1e-9", "-1" or "1,5".
 * @param {string} value The amount from the console, in major units
 * @param {string} currency The order's currency
 * @returns {number|null} The amount in minor units, or null when invalid
 */
function parseAmount(value, currency) {
    if (!/^\d{1,10}(\.\d{1,3})?$/.test(String(value || ''))) {
        return null;
    }

    var minor = Number(CKOHelper.getFormattedPrice(String(value), currency));

    return Number.isInteger(minor) && minor >= 1 ? minor : null;
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

    // The amount in minor units (a void releases what remains: no amount)
    // eslint-disable-next-line
    var formatedAmount = parseAmount(request.httpParameterMap.get('amount').stringValue, currency);

    if (task.stringValue !== 'void' && formatedAmount === null) {
        respond(400, { error: 'invalid_amount' });

        return;
    }

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

    // Methods that don't support the action, by the order's Checkout.com payment
    var ckoInstrument = CKOHelper.getCkoInstrument(order);
    var paymentMethod = ckoInstrument ? ckoInstrument.getPaymentMethod() : null;

    if ((task.stringValue === 'capture' || task.stringValue === 'void') && Object.prototype.hasOwnProperty.call(NO_CAPTURE_OR_VOID, paymentMethod)) {
        respond(200, { error: true, message: 'Capture and Void are not supported for ' + NO_CAPTURE_OR_VOID[paymentMethod] + ' payments.' });

        return;
    }

    if (task.stringValue === 'void' && paymentMethod === 'CHECKOUTCOM_SEQURA') {
        respond(200, { error: true, message: 'Void is not supported for Sequra payments.' });

        return;
    }

    // Prepare the payload
    // One action per opening of the console's dialog: a double click or a
    // retried request is processed once by Checkout.com
    // eslint-disable-next-line
    var nonce = request.httpParameterMap.get('nonce').stringValue;
    var idempotencyKey = nonce && /^[a-z0-9]{8,40}$/i.test(nonce) ? 'bm_' + order.getOrderNo() + '_' + task.stringValue + '_' + nonce : null;
    var gRequest = {
        // eslint-disable-next-line
        amount: formatedAmount, // eslint-disable-next-line
        reference: order.getOrderNo(), // eslint-disable-next-line
        chargeId: paymentId,
        service: order.custom.orderProcessedByABCorNAS,
        idempotencyKey: idempotencyKey,
    };

    if (task.stringValue === 'void') {
        delete gRequest.amount;
    }

    if (String(CKOHelper.getNasEnabled()) === 'NAS' && task.stringValue === 'capture') {
        gRequest.capture_type = 'NonFinal';

        var processing = levelTwoProcessing(order, formatedAmount, currency);

        if (processing) {
            gRequest.processing = processing;
        }
    }

    // Set the service parameter
    var serviceName = 'cko.transaction.' + task.stringValue + '.' + mode + '.service';

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
    // Capture and Void Klarna Transactions: only for a Klarna payment
    if (gResponse === 403 && paymentMethod === 'CHECKOUTCOM_KLARNA' && (task.stringValue === 'capture' || task.stringValue === 'void')) {
        gRequest = {
            chargeId: paymentId,
            reference: order.getOrderNo(),
            service: order.custom.orderProcessedByABCorNAS,
            idempotencyKey: idempotencyKey ? idempotencyKey + '_klarna' : null,
        };

        if (task.stringValue === 'capture') {
            gRequest.amount = formatedAmount;
            gRequest.type = 'klarna';
            gRequest.klarna = {
                description: CKOHelper.getValue(constants.CKO_BUSINESS_NAME) !== '' && CKOHelper.getValue(constants.CKO_BUSINESS_NAME) !== 'undefined' // eslint-disable-next-line
                    ? CKOHelper.getValue(constants.CKO_BUSINESS_NAME) : currentSite.httpHostName,
            };
        }

        serviceName = 'cko.klarna_transaction.' + task.stringValue + '.' + mode + '.service';

        try {
            gResponse = CKOHelper.getGatewayClient(serviceName, gRequest);
        } catch (e) {
            Logger.getLogger('checkoutcom').error('Business Manager Klarna {0} failed for order {1}: {2}', task.stringValue, order.getOrderNo(), e.message);
            gResponse = null;
        }
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
