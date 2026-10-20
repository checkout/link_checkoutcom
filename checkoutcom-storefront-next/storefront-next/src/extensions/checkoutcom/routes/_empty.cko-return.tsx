/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Gateway return route for payments that leave the page: 3DS challenges and
 * redirect methods (iDEAL, Klarna, PayPal, ...). Flow sends the shopper to the
 * session's success_url or failure_url (this route, built by getReturnUrls) with
 * `cko-payment-id` appended.
 *
 * Both legs go through the same verification: the instance places the order for
 * an approved or pending payment, and fails it (reopening the basket) for a
 * declined one. Never trust the leg alone.
 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { finalizeOrderSuccess } from '@/lib/checkout/place-order-orchestration.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { getLogger } from '@/lib/logger.server';
import { routes } from '@/route-paths';
import { completePayment } from '../lib/checkoutcom.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
    const logger = getLogger(context);
    const url = new URL(request.url);
    const paymentId = url.searchParams.get('cko-payment-id');
    const checkoutUrl = buildUrlFromContext(routes.checkout, context);

    if (!paymentId) {
        logger.warn('[checkoutcom] return route called without cko-payment-id');

        return redirect(`${checkoutUrl}?paymentError=payment_failed`);
    }

    try {
        const result = await completePayment(context, { paymentId });

        if (result.status === 'complete' && result.orderNo) {
            return redirect(finalizeOrderSuccess(context, { orderNo: result.orderNo }));
        }

        logger.info('[checkoutcom] return leg did not complete', { paymentId, leg: url.searchParams.get('leg') });
    } catch (error) {
        logger.error('[checkoutcom] return leg failed', { paymentId, error: String(error) });
    }

    return redirect(`${checkoutUrl}?paymentError=payment_failed`);
}

export default function CheckoutcomReturn() {
    return null;
}
