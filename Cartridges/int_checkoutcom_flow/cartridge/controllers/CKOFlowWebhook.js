'use strict';

/**
 * Webhook receiver for the Flow integration. Register in the Checkout.com
 * Dashboard as:
 *   https://<domain>/on/demandware.store/Sites-<site>-Site/default/CKOFlowWebhook-Handle
 *
 * Plain controller (no SFRA dependency): authenticates via HMAC signature or
 * Authorization header, deduplicates by event id, and returns real HTTP
 * status codes so the gateway retries failed deliveries.
 */

/* global request, response */

var webhookHelper = require('*/cartridge/scripts/flow/webhookHelper');

/**
 * Write a JSON response with a status code.
 * @param {number} status The HTTP status
 * @param {Object} body The response body
 */
function respond(status, body) {
    response.setStatus(status);
    response.setContentType('application/json');
    response.writer.print(JSON.stringify(body));
}

/**
 * Handle an incoming webhook.
 */
function handle() {
    var rawBody = request.httpParameterMap.requestBodyAsString;
    var signature = request.httpHeaders.get('cko-signature');
    var authorization = request.httpHeaders.get('authorization');

    if (!webhookHelper.isAuthentic(rawBody, signature, authorization)) {
        respond(401, { error: 'unauthorized' });
        return;
    }

    var event;
    try {
        event = JSON.parse(rawBody);
    } catch (e) {
        respond(400, { error: 'invalid-json' });
        return;
    }
    if (!event || !event.type) {
        respond(400, { error: 'invalid-event' });
        return;
    }

    if (webhookHelper.isProcessed(event.id)) {
        respond(200, { status: 'duplicate-ignored' });
        return;
    }

    try {
        webhookHelper.handleEvent(event);
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.getLogger('ckoflow').error('Webhook processing failed: {0}', e.message);
        respond(500, { error: 'processing-failed' });
        return;
    }

    webhookHelper.markProcessed(event.id, event.type);
    respond(200, { status: 'ok' });
}

handle.public = true;
exports.Handle = handle;
