'use strict';

var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');
var Site = require('dw/system/Site');

var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

var constants = require('*/cartridge/config/constants');

/**
 * Utility functions for the AlipayCN payment method.
 */
var alipayCnHelper = {
    /**
     * Handle the AlipayCN payment request.
     * @param {string} processorId The processor ID
     * @param {Object} order The order instance
     * @returns {Object} The request result with redirectUrl on success
     */
    handleRequest: function(processorId, order) {
        var gatewayResponse = null;
        var serviceId = 'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service';

        var gatewayRequest = this.getAlipayCnRequest(order, processorId);

        // Log the payment request data
        ckoHelper.log(
            processorId + ' ' + ckoHelper._('cko.request.data', 'cko'),
            gatewayRequest
        );

        try {
            gatewayResponse = ckoHelper.gatewayClientRequest(serviceId, gatewayRequest);
        } catch (e) {
            Logger.error('Error while processing AlipayCN payment request for order: ' + order.orderNo + '. Error: ' + e.message);
            return { error: true };
        }

        return this.handleResponse(gatewayResponse, order.orderNo);
    },

    /**
     * Build the AlipayCN payment request payload.
     * @param {Object} order The order instance
     * @param {string} processorId The processor ID
     * @returns {Object} The payment request data
     */
    getAlipayCnRequest: function(order, processorId) {
        var orderCurrency = order.getCurrencyCode();
        var amount = ckoHelper.getAmount(order);

        var billingAddress = order.getBillingAddress();

        var items = [];
        var pliIterator = order.getProductLineItems().iterator();
        while (pliIterator.hasNext()) {
            var pli = pliIterator.next();
            var unitPrice = Math.round(
                ckoHelper.getFormattedPrice(pli.adjustedGrossPrice.value.toFixed(2), orderCurrency) / pli.quantityValue
            );

            items.push({
                reference: pli.getProductID(),
                name: pli.getProductName(),
                quantity: pli.getQuantityValue(),
                unit_price: unitPrice,
            });
        }

        return {
            amount: amount,
            currency: orderCurrency,
            capture: true,
            payment_type: 'Regular',
            reference: order.orderNo,
            source: {
                type: 'alipay_cn',
                billing_address: ckoHelper.getFormattedBillingAddress(billingAddress),
            },
            processing: {
                terminal_type: 'WEB',
            },
            customer: ckoHelper.getCustomer(order),
            shipping: ckoHelper.getShipping(order),
            items: items,
            processing_channel_id: Site.getCurrent().getCustomPreferenceValue(constants.CKO_PROCESSING_CHANNEL_ID) || '',
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            metadata: ckoHelper.getMetadata({}, processorId),
        };
    },

    /**
     * Handle the AlipayCN payment response.
     * @param {Object} gatewayResponse The gateway response
     * @param {string} orderNumber The order number (for logging)
     * @returns {Object} The payment result
     */
    handleResponse: function(gatewayResponse, orderNumber) {
        var result = {
            error: true,
            redirectUrl: false,
        };

        if (gatewayResponse && Object.prototype.hasOwnProperty.call(gatewayResponse, 'id')) {
            result.transactionID = gatewayResponse.id;

            // Log the payment response data
            ckoHelper.log(
                'CHECKOUTCOM_ALIPAYCN ' + ckoHelper._('cko.response.data', 'cko'),
                gatewayResponse
            );

            var hasRedirectLink = Object.prototype.hasOwnProperty.call(gatewayResponse, '_links')
                && Object.prototype.hasOwnProperty.call(gatewayResponse._links, 'redirect');

            if (hasRedirectLink) {
                result.error = false;
                result.redirectUrl = gatewayResponse._links.redirect.href;
            } else {
                result.errorMessage = 'No redirect URL in AlipayCN payment response. Payment ID: ' + gatewayResponse.id + ', Order: ' + orderNumber;
                Logger.error(result.errorMessage);
            }
        } else {
            Logger.error('Invalid or empty AlipayCN payment response for order: ' + orderNumber);
        }

        return result;
    },
};

module.exports = alipayCnHelper;
