'use strict';

/**
 * Checkout.com webhook receiver. Register it on the Checkout.com Dashboard as:
 *
 *   https://<instance-host>/on/demandware.store/Sites-<siteId>-Site/default/CKOWebhook-Handle
 *
 * A plain controller rather than a Custom API: Checkout.com cannot obtain a
 * SLAS token. It authenticates with the shared key (HMAC), ignores repeated
 * events, and returns real status codes so Checkout.com retries failures.
 */

/* global request, response */

var Logger = require('dw/system/Logger');

var config = require('*/cartridge/scripts/checkoutcom/config');
var webhooks = require('*/cartridge/scripts/checkoutcom/webhooks');

/**
 * @param {number} status The HTTP status
 * @param {Object} body The JSON body
 */
function respond(status, body) {
    response.setStatus(status);
    response.setContentType('application/json');
    response.getWriter().print(JSON.stringify(body));
}

/**
 * Handle one webhook delivery.
 */
function handle() {
    var rawBody = request.getHttpParameterMap().getRequestBodyAsString();

    if (!webhooks.isAuthentic(rawBody, request.getHttpHeaders().get('cko-signature'), request.getHttpHeaders().get('authorization'))) {
        Logger.getLogger(config.LOG_CATEGORY).warn('Webhook rejected: invalid signature or key (check the Private Shared Key).');
        respond(401, { error: 'unauthorized' });

        return;
    }

    var event;

    try {
        event = JSON.parse(rawBody);
    } catch (e) {
        event = null;
    }

    if (!event || !event.type) {
        respond(400, { error: 'invalid-event' });

        return;
    }

    if (webhooks.isProcessed(event.id)) {
        Logger.getLogger(config.LOG_CATEGORY).info('Webhook {0} {1} already processed, ignored.', event.id, event.type);
        respond(200, { status: 'duplicate-ignored' });

        return;
    }

    try {
        webhooks.handleEvent(event);
    } catch (e) {
        Logger.getLogger(config.LOG_CATEGORY).error('Webhook {0} ({1}) failed: {2}', event.id, event.type, e.message);
        respond(500, { error: 'processing-failed' });

        return;
    }

    webhooks.markProcessed(event.id, event.type);
    respond(200, { status: 'ok' });
}

handle.public = true;

exports.Handle = handle;
