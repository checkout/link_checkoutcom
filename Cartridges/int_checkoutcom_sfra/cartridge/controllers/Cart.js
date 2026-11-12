'use strict';

var server = require('server');
server.extend(module.superModule);

var flowPaymentHelper = require('*/cartridge/scripts/helpers/flowPaymentHelper');

/**
 * Give the shopper their basket back if they abandoned the Checkout.com Flow
 * payment page.
 *
 * The standard SFRA place order route consumes the basket to create the order
 * before the shopper is sent to CKOFlow-Show, so a shopper who leaves that page
 * with the browser back button or the cart link would otherwise find an empty
 * cart. Only orders still waiting for payment are reclaimed: once the payment is
 * authorized, captured or pending the order has been placed and is left alone.
 *
 * This is prepended rather than appended so the basket is restored before the
 * base route builds the cart model, otherwise the page would still render empty.
 */
server.prepend('Show', function(req, res, next) {
    flowPaymentHelper.reclaimAbandonedOrder();

    return next();
});

/**
 * Same reclaim for the mini cart, so the header count and the popover do not
 * show an empty basket after the shopper leaves the Flow page.
 *
 * MiniCart is the remote include used by the standard page header. It is safe to
 * reclaim from here because the checkout layout that renders the Flow page uses
 * pageHeaderNomenu, which carries no mini cart include — so this can never fire
 * while the shopper is still on the Flow page paying.
 */
server.prepend('MiniCart', function(req, res, next) {
    flowPaymentHelper.reclaimAbandonedOrder();

    return next();
});

server.prepend('MiniCartShow', function(req, res, next) {
    flowPaymentHelper.reclaimAbandonedOrder();

    return next();
});

module.exports = server.exports();
