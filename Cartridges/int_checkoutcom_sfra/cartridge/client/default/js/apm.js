'use strict';

var processInclude = require('./util');
var validations = {
    sepa: require('./apm/sepa.js'),
    ideal: require('./apm/ideal.js'),
    boleto: require('./apm/boleto.js'),
    qpay: require('./apm/qpay.js'),
};

/**
 * Set APM Forms
 * @return {void} no return value
 */
function initApmAccordion() {
    // List item radio click action
    $('.cko-apm-accordion input[type="radio"]').on('click touch', function(e) {
        e.stopPropagation();

        $(this).parents('.cko-apm-accordion').trigger('click');
    });

    // List item click action
    $('.cko-apm-accordion').on('click touch', function(e) {
    // Prevent the form submission
        e.preventDefault();

        // Uncheck all radio buttons
        $('.cko-apm-accordion input[type="radio"]').prop('checked', false);

        // Activate the input
        $(this).children('input[type="radio"]').prop('checked', true);

        // Remove all active classes
        $('.cko-apm-accordion').removeClass('cko-apm-active');

        // Close all items
        $('.cko-apm-panel').css('maxHeight', '0px');
        $('.cko-apm-panel').removeClass('cko-apm-panel-opened');

        // Disable the container auto height (display: table)
        $('.cko-apm-panel').css('display', 'block');

        // Set the active element
        $(this).addClass('cko-apm-active');

        // Set the selected APM fields
        var apmId = $(this).parents('.apm-list-item').attr('id');
        $('input[name="dwfrm_billing_apmForm_ckoSelectedApm"]').val(apmId);

        // Open the sibling panel
        var panel = $(this).next();

        // Enable the container auto height
        panel.css('display', 'table');
        if (panel.css('maxHeight') !== '0px') {
            panel.css('maxHeight', '0px');
        } else {
            panel.css('maxHeight', panel.prop('scrollHeight') + 'px');
        }
    });
}

/**
 * jQuery APM helpers and initialise accordion on DOM ready.
 */
$(function() {
    initApmAccordion();
    processInclude(require('./apm/klarna'));
});

// Submit event
$('button.submit-payment').off('click touch').on('click touch', function(e) {
    if ($('input[name="dwfrm_billing_paymentMethod"]').val() === 'CHECKOUTCOM_APM') {
        // Remove all previous errors
        $('.apm-list-item .is-invalid').removeClass('is-invalid');
        $('.apm-list-item .invalid-field-message').hide();

        // Errors count
        var errors = [];

        // Get the APM container id
        var apmId = $('.cko-apm-active').parents('.apm-list-item').attr('id');

        // Run the form validation
        if (apmId !== 'klarna') {
            errors = validations[apmId].formValidation();
        }

        if (errors.length > 0) {
            // Prevent the default button click behaviour
            e.preventDefault();
            e.stopImmediatePropagation();

            // Add the invalid fileds invalid style
            for (var i = 0; i < errors.length; i++) {
                $(errors[i]).addClass('is-invalid');
            }

            // Show the invalid fields error message
            var invalidFieldMessage = $(errors[0]).parents('.apm-list-item').find('.invalid-field-message');
            invalidFieldMessage.show();
            invalidFieldMessage.text(
                window.ckoLang.apmFieldInvalid
            );

            // Scroll back to the error
            var scrollTarget = $(errors[0]).parents('.apm-list-item');
            $('html, body').animate({
                scrollTop: parseInt(scrollTarget.offset().top),
            }, 500);
        }
    }
});

module.exports = {
    /*
     * Get the APMs filter
     */
    filterApm: function() {
        // Get the APM controller URL
        var controllerUrl = $('#ckoApmFilterUrl').val();

        // Send the APM filter AJAX request
        var xhttpFilter = new XMLHttpRequest();
        xhttpFilter.onreadystatechange = function() {
            if (this.readyState === 4 && this.status === 200) {
                // Get the APM countries and currencies list
                var apmList = JSON.parse(this.responseText);

                // Get the user country and currency
                var userData = apmList.filterObject;

                // Display only the allowed APM for the user
                var dataArray = apmList.ckoApmFilterConfig;
                for (var item in dataArray) { //eslint-disable-line
                    var condition1 = dataArray[item].countries.includes(userData.country.toUpperCase());
                    var condition2 = dataArray[item].countries.includes('*');
                    var condition3 = dataArray[item].currencies.includes(userData.currency);
                    if ((condition1 || condition2) && condition3) {
                        $('#' + item).css('display', 'block');
                    }
                }
            }
        };

        xhttpFilter.open('GET', controllerUrl, true);
        xhttpFilter.send();
    },
};
