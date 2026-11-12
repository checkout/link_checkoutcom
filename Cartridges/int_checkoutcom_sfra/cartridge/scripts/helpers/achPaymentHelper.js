'use strict';

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');
var URLUtils = require('dw/web/URLUtils');

/** Utility **/
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions for ACH Direct Debit payment processing via Checkout.com.
 *
 * The payment source type is 'plaid' — the processor token obtained from
 * Plaid /processor/token/create is passed as source.token.
 * capture is always sent as true (no separate capture step for ACH).
 */
var achPaymentHelper = {
    /**
     * Submits the ACH payment request to Checkout.com using the Plaid processor token.
     * Called server-side from CKOMain-ProcessAchPayment after the client-side Plaid
     * Link flow has completed and the processor token has been obtained.
     *
     * @param {string} processorId    - Payment processor ID (CHECKOUTCOM_ACH)
     * @param {string} orderNumber    - SFCC order number
     * @param {string} processorToken - Plaid processor token from /processor/token/create
     * @returns {Object} Result with error flag and transactionID
     */
    handleRequest: function(processorId, orderNumber, processorToken) {
        var order = OrderMgr.getOrder(orderNumber);
        var gatewayResponse = null;

        try {
            var billingAddress = order.getBillingAddress();
            var paymentInstruments = order.getPaymentInstruments();
            var paymentInstrumentAmount = paymentInstruments[paymentInstruments.length - 1]
                .getPaymentTransaction().getAmount().getValue().toFixed(2);
            var ckoProcessingChannelId = Site.getCurrent().getCustomPreferenceValue('ckoProcessingChannelId');

            var amount = ckoHelper.getFormattedPrice(
                paymentInstrumentAmount,
                order.getCurrencyCode()
            );

            var gatewayRequest = {
                source: {
                    type: 'plaid',
                    token: processorToken,
                    account_holder: {
                        type: 'individual',
                        first_name: billingAddress.getFirstName(),
                        last_name: billingAddress.getLastName(),
                    },
                },
                amount: amount,
                currency: order.getCurrencyCode(),
                reference: order.orderNo,
                capture: true,
                processing_channel_id: ckoProcessingChannelId,
                customer: {
                    email: ckoHelper.getCustomer(order).email,
                    name: ckoHelper.getCustomer(order).name,
                },
                metadata: ckoHelper.getMetadata({}, processorId),
                billing_descriptor: ckoHelper.getBillingDescriptor(),
                success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
                failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            };

            ckoHelper.log(
                processorId + ' ' + ckoHelper._('cko.request.data', 'cko'),
                gatewayRequest
            );

            gatewayResponse = ckoHelper.gatewayClientRequest(
                'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                gatewayRequest
            );

            return this.handleResponse(gatewayResponse);
        } catch (error) {
            Logger.error('Error while authorizing ACH payment for order: ' + orderNumber + '. Error: ' + error.message);
            return {
                error: true,
                transactionID: '',
                achPending: false,
            };
        }
    },

    /**
     * Processes the Checkout.com gateway response for an ACH payment.
     * ACH returns HTTP 202 Accepted with status 'Pending' on success.
     *
     * @param {Object} gatewayResponse - The gateway response object
     * @returns {Object} Result with error flag, transactionID, and achPending flag
     */
    handleResponse: function(gatewayResponse) {
        var result = {
            error: true,
            transactionID: '',
            achPending: false,
        };

        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'id')) {
            result.transactionID = gatewayResponse.id;

            if (gatewayResponse.status === 'Pending') {
                result.error = false;
                result.achPending = true;
            }
        }

        return result;
    },
};

module.exports = achPaymentHelper;
