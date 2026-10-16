'use strict';

var cart = require('base/cart/cart');
var miniCartExpressPaypal = require('../paypal/minicartExpressPaypal');

var updateMiniCart = true;
var location = window.location;

function loadTranslations() {
  var a = $("#translationStrings").val();
  window.ckoLang = JSON.parse(a);
}

module.exports = function () {
    cart();

    $('.minicart').on('count:update', function (event, count) {
        if (count && $.isNumeric(count.quantityTotal)) {
            $('.minicart .minicart-quantity').text(count.quantityTotal);
            $('.minicart .minicart-link').attr({
                'aria-label': count.minicartCountOfItems,
                title: count.minicartCountOfItems
            });
        }
    });

    $('.minicart').on('mouseenter focusin touchstart', function () {
        if ($('.search:visible').length === 0) {
            return;
        }
        var url = $('.minicart').data('action-url');
        var count = parseInt($('.minicart .minicart-quantity').text(), 10);

        if (count !== 0 && $('.minicart .popover.show').length === 0) {
            if (!updateMiniCart) {
                $('.minicart .popover').addClass('show');
                return;
            }

            $('.minicart .popover').addClass('show');
            $('.minicart .popover').spinner().start();
            $.get(url, function (data) {
                $('.minicart .popover').empty();
                $('.minicart .popover').append(data);
                updateMiniCart = false;
                miniCartExpressPaypal.miniCartPayPalSDK();
                $.spinner().stop();
            });
        }
    });
    $('body').on('touchstart click', function (e) {
        if ($('.minicart').has(e.target).length <= 0) {
            $('.minicart .popover').removeClass('show');
        }
    });
    $('.minicart').on('mouseleave focusout', function (event) {
        if ((event.type === 'focusout' && $('.minicart').has(event.target).length > 0)
            || (event.type === 'mouseleave' && $(event.target).is('.minicart .quantity'))
            || $('body').hasClass('modal-open')) {
            event.stopPropagation();
            return;
        }
        $('.minicart .popover').removeClass('show');
    });
    $('body').on('change', '.minicart .quantity', function () {
        if ($(this).parents('.bonus-product-line-item').length && $('.cart-page').length) {
            location.reload();
        }
    });
    $('body').on('product:afterAddToCart', function () {
        updateMiniCart = true;
    });
    $('body').on('cart:update', function(e, data) {
        updateMiniCart = true;

        var subTotal = '0.00';
        if (data) {
            if (data.subTotal) {
                subTotal = data.subTotal;
            } else if (data.basket && data.basket.subTotal) {
                subTotal = data.basket.subTotal;
            }
        }
        subTotal = subTotal.toString().replace(/[^\d.]/g, '');

        $('#ckoMiniCartProductPrice').val(subTotal);
        $('#ckoCartProductPrice').val(subTotal);


        var totalTax = '0.00';
        if (data) {
            if (data.totalTax) {
                totalTax = data.totalTax;
            } else if (data.basket && data.basket.totalTax) {
                totalTax = data.basket.totalTax;
            }
        }
        totalTax = totalTax.toString().replace(/[^\d.]/g, '');

        $('#ckoMiniCartSalesTax').val(totalTax);
        $('#ckoCartSalesTax').val(totalTax);
    });

    $('body').on('promotion:success', function(e, data) {
        var subTotal = '0.00';
        if (data) {
            if (data.subTotal) {
                subTotal = data.subTotal;
            } else if (data.basket && data.basket.subTotal) {
                subTotal = data.basket.subTotal;
            }
        }
        subTotal = subTotal.toString().replace(/[^\d.]/g, '');

        $('#ckoMiniCartProductPrice').val(subTotal);
        $('#ckoCartProductPrice').val(subTotal);


        var totalTax = '0.00';
        if (data) {
            if (data.totalTax) {
                totalTax = data.totalTax;
            } else if (data.basket && data.basket.totalTax) {
                totalTax = data.basket.totalTax;
            }
        }
        totalTax = totalTax.toString().replace(/[^\d.]/g, '');

        $('#ckoMiniCartSalesTax').val(totalTax);
        $('#ckoCartSalesTax').val(totalTax);
    });

    $(document).ready(function() {
        loadTranslations();
    });
};
