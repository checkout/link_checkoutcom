'use strict';

/**
 * Wraps the default getButtonsHtml function to handle Bizum payment method actions.
 * For Bizum orders, Capture and Void are not supported — only Refund is available
 * once the payment has been captured.
 */
(function () {
    var originalGetButtonsHtml = getButtonsHtml;

    // Override global getButtonsHtml defined in list.js
    getButtonsHtml = function (cell) { // eslint-disable-line no-global-assign
        var rowData = cell.getRow().getData();

        if (rowData.payment_method !== 'CHECKOUTCOM_BIZUM') {
            return originalGetButtonsHtml(cell);
        }

        var paymentId;
        if (rowData.transaction_id && rowData.transaction_id.indexOf('pay_') !== -1) {
            paymentId = rowData.transaction_id;
        } else if (rowData.payment_id && rowData.payment_id.indexOf('pay_') !== -1) {
            paymentId = rowData.payment_id;
        }

        if (paymentId != null && parseFloat(rowData.refundable_amount) > 0) {
            return '<button type="button" id="refund-button-' + paymentId + '" class="btn btn-secondary ckoAction">'
                + window.ckoLang.refund
                + '</button>';
        }

        return '<div class="ckoLocked">&#x1f512;</div>';
    };
}());
