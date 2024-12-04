'use strict';

var paymentContextId;
var orderID;
async function fetchClientToken(billingCountry) {
    var klarnaContextUrl = $('.klarnaCreateContextUrl').val();
    if (!klarnaContextUrl) {
        return;
    };
    return new Promise(function (resolve, reject) {
        $.ajax({
            url: klarnaContextUrl,
            method: 'POST',
            dataType: 'json',
            data: {
                billingCountry: billingCountry,
            },
            success: function (response) {
                return resolve(response);
            },
            error: function(response) {
                if (response && response.responseJSON) {
                    $('#klarna-payments-container').html('<div class="klarna-not-available"><p style="font-size: 24px"><strong>' +  response.responseJSON.errorTitle + '</strong></p><p>' + response.responseJSON.message + '</p></div>');
                    $('.klarna-tab').addClass('disable-klarna-checkout');
                    if ($('.klarna-tab').hasClass('active')) {
                        $('button.submit-payment').prop('disabled', true).addClass('disabled');
                    }
                }
                return reject(response);
            }
        });

    });
}

async function initializeKlarna(billingCountry) {
    try {
        const response = await fetchClientToken(billingCountry);
        if (!response || !response.id) {
            return;
        }
        $('#klarna-payments-container').html('');
        $('button.submit-payment').prop('disabled', false).removeClass('disabled');
        $('.klarna-tab').removeClass('disable-klarna-checkout');
        paymentContextId = response && response.id ? response.id : '';
        const clientToken = response && response.partner_metadata ? response.partner_metadata.client_token : '';
        var $klarnaDataInput = $('input[name="dwfrm_billing_klarnaForm_ckoKlarnaData"]');
        $klarnaDataInput.val(JSON.stringify({paymentContext_id: paymentContextId}));
        Klarna.Payments.init({ client_token: clientToken });
        Klarna.Payments.load(
            {
                container: '#klarna-payments-container',
            },
            {},
            function (res) {
                console.debug(res);
            }
        );
    } catch (error) {
        console.error('Error occurred while initializing or loading Klarna:', error);
    }
}

async function onPaymentContextApproved(res) {
    var klarnaOnApproveUrl = $('.klarnaonApproveUrl').val();

        if (!klarnaOnApproveUrl) {
            console.log('klarna callback url is not available');
            return;
        };
        $.spinner().start();
        $.ajax({
            url: klarnaOnApproveUrl,
            method: 'POST',
            dataType: 'json',
            data: {
                paymentContextId: paymentContextId,
                orderID: orderID,
            },
            success: function(response) {
                if (response.error) {
                    if (response.cartError) {
                        window.location.href = response.redirectUrl;
                    } else {
                        var currentURL = location.href;
                        var hasError = new URL(currentURL).searchParams.has('hasError');
                        if (hasError) {
                            location.href = currentURL;
                        } else {
                            location.href = currentURL + '&hasError=true';
                        }
                    }
                    if (response.errorMessage) {
                        $('.error-message').show();
                        $('.error-message-text').text(response.errorMessage);
                    }
                } else {
                    var redirect = $('<form>').appendTo(document.body)
                        .attr({
                            method: 'POST',
                            action: response.continueUrl,
                        });
                    $('<input>').appendTo(redirect)
                        .attr({
                            name: 'orderID',
                            value: response.orderID,
                        });
                    $('<input>').appendTo(redirect)
                        .attr({
                            name: 'orderToken',
                            value: response.orderToken,
                        });
                    redirect.submit();
                }
                $.spinner().stop();
            },
            error: function(e) {
                $.spinner().stop();
            }
        });
}

function authorizeKlarna(order) {
    orderID = order.orderNo;
    var billingAddress = order.billingAddress;
    var shippingAddress = order.shippingAddress;
    Klarna.Payments.authorize(
        {},
        {
            billing_address: {
                given_name: billingAddress.firstName,
                family_name: billingAddress.lastName,
                email: order.customerEmail,
                street_address: billingAddress.address1,
                postal_code: billingAddress.postalCode,
                city: billingAddress.city,
                phone: billingAddress.phone,
                country: billingAddress.countryCode,
            },
            purchase_amount: order.totalGrossPrice * 100,
            shipping_address: {
                given_name: shippingAddress.firstName,
                family_name: shippingAddress.lastName,
                email:  order.customerEmail,
                street_address: shippingAddress.address1,
                postal_code: shippingAddress.postalCode,
                city: shippingAddress.city,
                phone: shippingAddress.phone,
                country: shippingAddress.countryCode,
            },
        },
        function (res) {
            onPaymentContextApproved(res);
        }
    );
}

$(document).ready( function () {
    var checkoutStage = $('.data-checkout-stage').data('checkout-stage');
    if (checkoutStage === 'payment' || checkoutStage === 'placeOrder') {
        initializeKlarna();
    }
});

module.exports = {
    initializeKlarna: initializeKlarna,
    authorizeKlarna: authorizeKlarna
};

