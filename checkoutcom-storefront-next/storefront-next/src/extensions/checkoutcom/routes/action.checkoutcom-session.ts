/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Create the Checkout.com payment session for the shopper's basket, after
 * making sure the basket carries a CHECKOUTCOM_FLOW payment instrument.
 *
 * POST { locale? } -> 200 { paymentSession, publicKey, environment } | 4xx/5xx { error }
 */
import type { ActionFunctionArgs } from 'react-router';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { getLogger } from '@/lib/logger.server';
import { createPaymentSession, ensurePaymentInstrument, getReturnUrls } from '../lib/checkoutcom.server';

export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const logger = getLogger(context);
    const { locale } = ((await request.json().catch(() => ({}))) ?? {}) as { locale?: string };

    try {
        const basket = (await getBasket(context)).current;

        if (!basket?.basketId) {
            return Response.json({ error: 'No basket' }, { status: 409 });
        }

        const updated = await ensurePaymentInstrument(context, basket);

        updateBasketResource(context, updated);

        const session = await createPaymentSession(context, {
            basket: updated,
            locale,
            ...getReturnUrls(request, context),
        });

        return Response.json(session);
    } catch (error) {
        logger.error('[checkoutcom] payment session creation failed', { error: String(error) });

        return Response.json({ error: 'Payment session creation failed' }, { status: 502 });
    }
}
