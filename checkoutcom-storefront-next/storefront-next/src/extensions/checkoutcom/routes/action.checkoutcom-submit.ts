/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Called from Flow's handleSubmit. Creates the order from the basket (unless
 * the client already has one for this attempt), then submits the payment with
 * the order number as its reference. The gateway response goes back to Flow
 * unmodified. If the submission fails, the order is failed and the basket
 * reopened so the shopper can try again.
 *
 * POST { sessionId, sessionData, orderNo? } -> 200 { orderNo, response } | 4xx/5xx { error, orderNo? }
 */
import type { ActionFunctionArgs } from 'react-router';
import { getBasket } from '@/middlewares/basket.server';
import { getLogger } from '@/lib/logger.server';
import { createOrder, failOrder, removeExtraPaymentInstruments, submitPayment } from '../lib/checkoutcom.server';

interface SubmitBody {
    sessionId?: string;
    sessionData?: string;
    orderNo?: string;
}

export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const logger = getLogger(context);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as SubmitBody;

    if (!body.sessionId || !body.sessionData) {
        return Response.json({ error: 'sessionId and sessionData are required' }, { status: 400 });
    }

    let orderNo = body.orderNo;

    try {
        if (!orderNo) {
            const basket = (await getBasket(context)).current;

            if (!basket?.basketId) {
                return Response.json({ error: 'No basket' }, { status: 409 });
            }

            // Never copy a duplicate payment instrument into the order
            await removeExtraPaymentInstruments(context, basket);
            orderNo = (await createOrder(context, basket.basketId)).orderNo;
        }
    } catch (error) {
        logger.error('[checkoutcom] order creation failed', { error: String(error) });

        return Response.json({ error: 'The order could not be created' }, { status: 502 });
    }

    try {
        const response = await submitPayment(context, {
            sessionId: body.sessionId,
            sessionData: body.sessionData,
            orderNo: orderNo as string,
        });

        return Response.json({ orderNo, response });
    } catch (error) {
        logger.error('[checkoutcom] payment submission failed', { orderNo, error: String(error) });
        await failOrder(context, orderNo as string);

        return Response.json({ error: 'The payment could not be submitted' }, { status: 502 });
    }
}
