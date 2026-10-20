/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Fail an order whose payment did not go through and reopen the basket, so the
 * shopper can pay again (another card or method).
 *
 * POST { orderNo } -> 200 { basketRecovered } | 400
 */
import type { ActionFunctionArgs } from 'react-router';
import { getLogger } from '@/lib/logger.server';
import { failOrder } from '../lib/checkoutcom.server';

export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(null, { status: 405 });
    }

    const { orderNo } = ((await request.json().catch(() => ({}))) ?? {}) as { orderNo?: string };

    if (!orderNo) {
        return Response.json({ error: 'orderNo is required' }, { status: 400 });
    }

    const basketRecovered = await failOrder(context, orderNo);

    getLogger(context).info('[checkoutcom] fail-order', { orderNo, basketRecovered });

    return Response.json({ basketRecovered });
}
