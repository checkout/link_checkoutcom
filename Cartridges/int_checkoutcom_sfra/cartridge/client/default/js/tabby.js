'use strict';

function createTabbyContext() {
    var tabbyContextUrl = $('.tabbyCreateContextUrl').val();
    if (!tabbyContextUrl) {
        return;
    }

    var csrfToken = $('#tabby-content input[name="csrf_token"]').val();

    $.ajax({
        url: tabbyContextUrl,
        method: 'POST',
        dataType: 'json',
        data: { csrf_token: csrfToken },
        success: function (response) {
            if (response && response.success) {
                $('button.submit-payment').prop('disabled', false).removeClass('disabled');
                $('.tabby-content .invalid-field-message').text('').hide();
                $('.tabby-tab').removeClass('disable-tabby-checkout');
            } else {
                showTabbyError(response && response.message);
            }
        },
        error: function (xhr) {
            var msg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : '';
            showTabbyError(msg);
        }
    });
}

function showTabbyError(message) {
    $('.tabby-content .invalid-field-message').text(message || '').show();
    $('.tabby-tab').addClass('disable-tabby-checkout');
    if ($('.tabby-tab').hasClass('active')) {
        $('button.submit-payment').prop('disabled', true).addClass('disabled');
    }
}

$(document).on('click touch', '.payment-options a.nav-link', function () {
    if ($(this).hasClass('tabby-tab') && $(this).hasClass('disable-tabby-checkout')) {
        $('button.submit-payment').prop('disabled', true).addClass('disabled');
    } else if (!$(this).hasClass('tabby-tab') && $('.tabby-content').length) {
        $('button.submit-payment').prop('disabled', false).removeClass('disabled');
    }
});

$(document).ready(function () {
    var checkoutStage = $('.data-checkout-stage').data('checkout-stage');
    var isTabbyEnabled = $('.tabby-tab').length > 0;
    if ((checkoutStage === 'payment' || checkoutStage === 'placeOrder') && isTabbyEnabled) {
        createTabbyContext();
    }
});

$('body').on('checkout:updateCheckoutView', function () {
    if ($('.tabby-tab').length > 0) {
        $('.tabby-tab').removeClass('disable-tabby-checkout');
        $('.tabby-content .invalid-field-message').text('').hide();
        createTabbyContext();
    }
});

module.exports = {
    createTabbyContext: createTabbyContext
};
