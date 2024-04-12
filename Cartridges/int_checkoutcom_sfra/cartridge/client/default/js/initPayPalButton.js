'use strict';

var errorMsgContainer =  $('.error-message .error-message-text');

var defaultStyle = {
    color: 'gold',
    shape: 'rect',
    layout: 'vertical',
    label: 'paypal',
    tagline: false
};

/**
 *  Gets paypal button styles
 * @param {Element} button - button element
 * @returns {Object} with button styles or if error appears with default styles
 */
function getPaypalButtonStyle(button) {
    try {
        var config = button.getAttribute('data-paypal-button-config');
        if (config) {
            var buttonConfig = JSON.parse(config).billing;
            return  buttonConfig;
        }
    } catch (error) {
        return {
            style: defaultStyle
        };
    }
}

/**
 * removes any error messages displayed in the billing page
 */
function removeErrorMessages() {
    errorMsgContainer.empty();
    $('.error-message').css('display','none');
}

/**
 * Displays error messages
 * @param {Object} response - Response object containing error message
 */
function displayErrorMessages(response) {
    errorMsgContainer.empty();
    errorMsgContainer.text(response.message);
    errorMsgContainer.css('display','block');
    $('.error-message').css('display','block');
    hidePayPalOverlay();
}

/**
 * To close payPal overlay
 */
function hidePayPalOverlay() {
    $('[id^="paypal-overlay-uid_"]').css('display', 'none');
}


/**
 * Retrieves PayPal order ID
 * @returns {Promise} A promise that resolves with the PayPal order ID
 */
const createPayPalOrder = () => {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: $('#payPalCreateOrderUrl').val(),
            type: 'POST',
            success: function(response) {
                if(response.success) {
                    removeErrorMessages();
                    var contextIdInput =  $('input[name="dwfrm_billing_payPalForm_ckoPayPalPaymentContextId"]');
                    contextIdInput.val(response.id);
                    return resolve(response.partner_metadata.order_id);
                }
                if(response.error) {
                    if(response.status || response.message) {
                        displayErrorMessages(response);
                    } else {
                        hidePayPalOverlay();
                    }
                }
                return reject(response);
            },
            error: function(error) {
                reject(error);
                var errorMsg = error && error.responseJSON ? error.responseJSON: '';
                if (errorMsg) {
                    displayErrorMessages(errorMsg);
                } else {
                    hidePayPalOverlay();
                }
            },
        });
    });
};

const onApprove = () => {
    var paypalContextId = $('#ckoPayPalPaymentContextId').val();
    return new Promise(function(resolve, reject) {
        $.ajax({
            type: 'GET',
            url: $('#payPalonApproveUrl').val(),
            dataType: 'text',
            data: { id: paypalContextId },
            success: function(response) {
                var responseData = JSON.parse(response);
                if (responseData && responseData.success) {
                    resolve(responseData);
                    removeErrorMessages();

                    responseData.response.paymentContext_id = paypalContextId;
                    var ckoPayPalData = JSON.stringify(responseData.response);
                    var $payPalDataInput = $('input[name="dwfrm_billing_payPalForm_ckoPayPalData"]');
                    var $invalidFieldMessage = $('#paypal-content .invalid-field-message');
                    $payPalDataInput.val(ckoPayPalData);

                    if ($payPalDataInput.val() === '') {
                        $invalidFieldMessage.text(window.ckoLang.payPalDataInvalid);
                    }
                    // trigger submit payment
                    $('button.submit-payment').trigger('click');
                } else {
                    displayErrorMessages(responseData);
                }
            },
            error: function(error) {
                reject(error);
                var errorMsg = error && error.responseJSON ? error.responseJSON: '';
                if (errorMsg) {
                    displayErrorMessages(errorMsg);
                } else {
                    hidePayPalOverlay();
                }
            },
        });
    });
}

const  initPayPalButton = () => {
    paypal_sdk.Buttons({
        createOrder: createPayPalOrder,
        onApprove: onApprove,
        style: getPaypalButtonStyle(document.querySelector('.js_paypal_button_on_billing_form'))
    }).render('#paypal-button-container');
}

module.exports = {
    initPayPalButton: initPayPalButton,
    createPayPalOrder: createPayPalOrder
};

