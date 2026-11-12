'use strict';

/* API Includes */
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger').getLogger('ckoPayments');

/* Utility */
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');

/** Checkout Data Configuration File **/
var constants = require('*/cartridge/config/constants');

/**
 * Utility functions for the Sequra payment method.
 */
var sequraHelper = {
    /**
     * Handle the payment request.
     * @param {string} processorId The processor ID
     * @param {Object} order The order instance
     * @param {string} selectedProduct The selected Sequra product code (e.g. 'invoice', 'pp5', 'sp1', 'pp3', 'flexi')
     * @returns {Object} The request success or failure
     */
    handleRequest: function (processorId, order, selectedProduct) {
        try {
            var gatewayRequest = this.getSequraRequest(processorId, order, selectedProduct);

            // Log the full unmasked request to custom-ckoPayments-*.log for debugging
            Logger.info('Sequra raw request for order {0}: {1}', order.orderNo, JSON.stringify(gatewayRequest));
            ckoHelper.log(processorId + ' ' + ckoHelper._('cko.request.data', 'cko'), gatewayRequest);

            var gatewayResponse = ckoHelper.gatewayClientRequest(
                'cko.card.charge.' + ckoHelper.getValue(constants.CKO_MODE) + '.service',
                gatewayRequest,
                'POST'
            );

            ckoHelper.log(processorId + ' ' + ckoHelper._('cko.response.data', 'cko'), gatewayResponse);

            return this.handleResponse(gatewayResponse);
        } catch (error) {
            Logger.error('Error while authorizing the Sequra payment request for order: ' + order.orderNo + '. Error: ' + error.message);
            return { error: true };
        }
    },

    /**
     * Build the Sequra payment request object.
     * @param {string} processorId The processor ID
     * @param {Object} order The order instance
     * @param {string} selectedProduct The selected Sequra product code (e.g. 'invoice', 'pp5', 'sp1', 'pp3', 'flexi')
     * @returns {Object} The gateway request payload
     */
    getSequraRequest: function (processorId, order, selectedProduct) {
        var Site = require('dw/system/Site');
        var billingAddress = order.getBillingAddress();
        var shipment = order.getDefaultShipment();
        var shippingAddress = shipment.getShippingAddress();
        var orderCurrency = order.getCurrencyCode();
        var formattedPrice = parseInt(ckoHelper.getFormattedPrice(order.totalGrossPrice.value.toFixed(2), orderCurrency), 10);
        var captureEnabled = Site.getCurrent().getCustomPreferenceValue(constants.CKO_SEQURA_CAPTURE) || false;
        var processingChannelId = Site.getCurrent().getCustomPreferenceValue(constants.CKO_PROCESSING_CHANNEL_ID) || '';

        // Map internal product codes to checkout.com processing.product_type values
        var productTypeMap = {
            invoice: 'invoice',
            pp5: 'pay_later',
            sp1: 'pay_by_instalment_3',
            pp3: 'pay_by_instalment',
            flexi: 'pay_by_instalment',
        };
        var processingProductType = productTypeMap[selectedProduct] || 'invoice';

        // Build line items from order — items[].type is required by the API.
        // If a product is marked digital (custom attr ckoSequraItemType = 'digital'),
        // items[].service_ends_on is also required (custom attr ckoSequraServiceEndsOn, format YYYY-MM-DD).
        var items = [];
        var totalItemDiscountFormatted = 0;
        var pliIterator = order.getProductLineItems().iterator();
        while (pliIterator.hasNext()) {
            var pli = pliIterator.next();

            // unit_price must be the undiscounted per-unit price so that the Sequra
            // invariant holds: total_amount = (unit_price × quantity) − discount_amount
            var grossPriceFormatted = parseInt(ckoHelper.getFormattedPrice(pli.grossPrice.value.toFixed(2), orderCurrency), 10);
            var adjustedPriceFormatted = parseInt(ckoHelper.getFormattedPrice(pli.adjustedGrossPrice.value.toFixed(2), orderCurrency), 10);
            var unitPrice = Math.round(grossPriceFormatted / pli.quantityValue);
            var itemDiscountFormatted = Math.max(0, grossPriceFormatted - adjustedPriceFormatted);
            var totalAmount = unitPrice * pli.quantityValue - itemDiscountFormatted;
            totalItemDiscountFormatted += itemDiscountFormatted;

            items.push({
                name: pli.getProductName(),
                quantity: pli.getQuantityValue(),
                unit_price: unitPrice,
                total_amount: totalAmount,
                discount_amount: itemDiscountFormatted,
                reference: pli.getProductID(),
                type: 'physical',
            });
        }

        // Add any pure order-level price adjustments (basket promotions) not yet prorated into
        // individual line items. In standard SFCC these are prorated into adjustedGrossPrice,
        // so this sum is typically 0, but we include it to satisfy the AC requirement of
        // processing.discount_amount = sum(items[].discount_amount) + order-level discounts.
        var orderLevelDiscountFormatted = 0;
        var orderAdjIterator = order.getPriceAdjustments().iterator();
        while (orderAdjIterator.hasNext()) {
            var orderAdj = orderAdjIterator.next();
            orderLevelDiscountFormatted += parseInt(
                ckoHelper.getFormattedPrice(Math.abs(orderAdj.price.value).toFixed(2), orderCurrency), 10
            );
        }
        var totalDiscountFormatted = totalItemDiscountFormatted + orderLevelDiscountFormatted;

        return {
            amount: formattedPrice,
            currency: orderCurrency,
            source: {
                type: 'sequra',
                billing_address: {
                    address_line1: billingAddress.getAddress1() || '',
                    address_line2: billingAddress.getAddress2() || '',
                    city: billingAddress.getCity() || '',
                    state: billingAddress.getStateCode() || '',
                    zip: billingAddress.getPostalCode() || '',
                    country: billingAddress.getCountryCode().value.toUpperCase(),
                },
            },
            processing_channel_id: processingChannelId,
            capture: captureEnabled,
            reference: order.orderNo,
            customer: ckoHelper.getCustomer(order),
            shipping: {
                address: {
                    address_line1: shippingAddress.getAddress1() || '',
                    address_line2: shippingAddress.getAddress2() || '',
                    city: shippingAddress.getCity() || '',
                    state: shippingAddress.getStateCode() || '',
                    zip: shippingAddress.getPostalCode() || '',
                    country: shippingAddress.getCountryCode().value.toUpperCase(),
                },
            },
            processing: {
                product_type: processingProductType,
                shipping_amount: parseInt(ckoHelper.getFormattedPrice(shipment.adjustedShippingTotalGrossPrice.value.toFixed(2), orderCurrency), 10),
                discount_amount: totalDiscountFormatted,
            },
            payment_ip: request.httpRemoteAddress || '',
            items: items,
            success_url: URLUtils.https('CKOMain-HandleReturn').toString(),
            failure_url: URLUtils.https('CKOMain-HandleFail').toString(),
            metadata: ckoHelper.getMetadata({}, processorId),
        };
    },

    /**
     * Handle the payment response.
     * @param {Object} gatewayResponse The gateway response data
     * @returns {Object} The payment result with redirectUrl or error
     */
    handleResponse: function (gatewayResponse) {
        if (!gatewayResponse) {
            Logger.error('Sequra payment response is null/false — service call may have failed');
            return { error: true };
        }

        var transactionID = gatewayResponse.id || '';

        if (gatewayResponse._links && gatewayResponse._links.redirect && gatewayResponse._links.redirect.href) {
            return {
                error: false,
                transactionID: transactionID,
                redirectUrl: gatewayResponse._links.redirect.href,
            };
        }

        // Log the full response so the API error body is visible in custom.ckoPayments-*.log
        Logger.error(
            'Sequra payment response missing redirect link. Transaction ID: {0}. Response: {1}',
            transactionID,
            JSON.stringify(gatewayResponse)
        );
        return {
            error: true,
            transactionID: transactionID,
            errorMessage: gatewayResponse.error_codes
                ? gatewayResponse.error_codes.join(', ')
                : (gatewayResponse.error_type || 'No redirect link in response'),
        };
    },
};

/**
 * Module exports
 */
module.exports = sequraHelper;
