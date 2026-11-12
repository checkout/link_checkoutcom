'use strict';

/**
 * Wraps the default getButtonsHtml function to handle Sequra payment method actions.
 * For Sequra orders, Void is not supported — Capture (from AUTH state) and Refund
 * (once captured) are the only available actions.
 */
(function () {
    var originalGetButtonsHtml = getButtonsHtml;

    // Override global getButtonsHtml defined in list.js
    getButtonsHtml = function (cell) { // eslint-disable-line no-global-assign
        var rowData = cell.getRow().getData();

        if (rowData.payment_method !== 'CHECKOUTCOM_SEQURA') {
            return originalGetButtonsHtml(cell);
        }

        var paymentId;
        if (rowData.transaction_id && rowData.transaction_id.indexOf('pay_') !== -1) {
            paymentId = rowData.transaction_id;
        } else if (rowData.payment_id && rowData.payment_id.indexOf('pay_') !== -1) {
            paymentId = rowData.payment_id;
        }

        if (paymentId == null) {
            return '<div class="ckoLocked">&#x1f512;</div>';
        }

        var opened = JSON.parse(rowData.opened);
        var amount = parseFloat(rowData.amount);
        var capturedAmount = parseFloat(rowData.captured_amount);
        var refundableAmount = parseFloat(rowData.refundable_amount);
        var buttons = '';

        if (rowData.abcOrNasEnabled === 'NAS') {
            if (opened) {
                if (rowData.type === 'AUTH') {
                    buttons += '<button type="button" id="capture-button-' + paymentId + '" class="btn btn-info ckoAction">'
                        + window.ckoLang.capture + '</button>';
                } else if (rowData.type === 'CAPTURE') {
                    if (amount !== capturedAmount) {
                        buttons += '<button type="button" id="capture-button-' + paymentId + '" class="btn btn-info ckoAction">'
                            + window.ckoLang.capture + '</button>';
                    }
                    buttons += '<button type="button" id="refund-button-' + paymentId + '" class="btn btn-secondary ckoAction">'
                        + window.ckoLang.refund + '</button>';
                }
            } else {
                if (rowData.type === '') {
                    return '<div class="ckoLocked">&#x1f512;</div>';
                }
                if (amount !== capturedAmount && refundableAmount !== 0) {
                    buttons += '<button type="button" id="capture-button-' + paymentId + '" class="btn btn-info ckoAction">'
                        + window.ckoLang.capture + '</button>';
                    buttons += '<button type="button" id="refund-button-' + paymentId + '" class="btn btn-secondary ckoAction">'
                        + window.ckoLang.refund + '</button>';
                } else if (amount === capturedAmount && refundableAmount !== 0) {
                    buttons += '<button type="button" id="refund-button-' + paymentId + '" class="btn btn-secondary ckoAction">'
                        + window.ckoLang.refund + '</button>';
                } else if (amount !== capturedAmount && refundableAmount === 0 && rowData.type !== 'AUTH_REVERSAL') {
                    buttons += '<button type="button" id="capture-button-' + paymentId + '" class="btn btn-info ckoAction">'
                        + window.ckoLang.capture + '</button>';
                } else {
                    return '<div class="ckoLocked">&#x1f512;</div>';
                }
            }
        } else {
            // ABC mode — same as default but without void button
            if (opened && rowData.type !== 'CREDIT') {
                if (rowData.type === 'AUTH') {
                    buttons += '<button type="button" id="capture-button-' + paymentId + '" class="btn btn-info ckoAction">'
                        + window.ckoLang.capture + '</button>';
                } else if (rowData.type === 'CAPTURE') {
                    buttons += '<button type="button" id="refund-button-' + paymentId + '" class="btn btn-secondary ckoAction">'
                        + window.ckoLang.refund + '</button>';
                }
            } else if (refundableAmount > 0) {
                buttons += '<button type="button" id="refund-button-' + paymentId + '" class="btn btn-secondary ckoAction">'
                    + window.ckoLang.refund + '</button>';
            } else {
                return '<div class="ckoLocked">&#x1f512;</div>';
            }
        }

        return buttons || '<div class="ckoLocked">&#x1f512;</div>';
    };
}());
