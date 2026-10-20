/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Verify a completed Flow payment and place its order (idempotent).
 *
 * POST { paymentId, orderNo? } -> 200 CompletionResult | 4xx/5xx { status: 'failed', errorMessage }
 */
import type { ActionFunctionArgs } from 'react-router';
import { getBasket } from '@/middlewares/basket.server';
import { getLogger } from '@/lib/logger.server';
import { completePayment, createOrder, failOrder } from '../lib/checkoutcom.server';

export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const logger = getLogger(context);
    const { paymentId, orderNo } = ((await request.json().catch(() => ({}))) ?? {}) as {
        paymentId?: string;
        orderNo?: string;
    };

    if (!paymentId) {
        return Response.json({ status: 'failed', errorMessage: 'paymentId is required' }, { status: 400 });
    }

    try {
        if (orderNo) {
            return Response.json(await completePayment(context, { paymentId, orderNo }));
        }

        // A payment completed without an order (a wallet that paid without
        // handleSubmit): create the order from the basket it was made for, and let
        // the instance accept the payment for it by that basket id.
        const basketId = (await getBasket(context, { ensureBasket: 'read' })).current?.basketId;

        if (!basketId) {
            return Response.json({ status: 'failed', errorMessage: 'No basket for this payment' }, { status: 409 });
        }

        const order = await createOrder(context, basketId);
        const result = await completePayment(context, { paymentId, orderNo: order.orderNo, basketId });

        if (result.status !== 'complete') {
            await failOrder(context, order.orderNo as string);
        }

        return Response.json(result);
    } catch (error) {
        logger.error('[checkoutcom] payment completion failed', { paymentId, orderNo, error: String(error) });

        return Response.json({ status: 'failed', errorMessage: 'Payment completion failed' }, { status: 502 });
    }
}
