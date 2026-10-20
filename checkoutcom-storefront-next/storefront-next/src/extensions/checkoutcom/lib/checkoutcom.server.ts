/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Server-side helpers shared by the Checkout.com routes: SCAPI basket and order
 * mutations, and calls to the instance's `checkoutcom` Custom API. The Custom
 * API holds the secret key; nothing here sees card data or keys.
 */
import type { RouterContextProvider } from 'react-router';
import { createApiClients } from '@/lib/api-clients.server';
import { addPaymentInstrumentToBasket, removePaymentInstrumentFromBasket } from '@/lib/api/basket.server';
import { buildUrlFromContext } from '@/lib/url.server';
import type { ShopperBasketsV2, ShopperOrders } from '@/scapi';

type Basket = ShopperBasketsV2.schemas['Basket'];
type Order = ShopperOrders.schemas['Order'];
type Context = Readonly<RouterContextProvider>;

export const PAYMENT_METHOD_ID = 'CHECKOUTCOM_FLOW';

/** Storefront path of the gateway return route (routes/_empty.cko-return.tsx). */
export const RETURN_PATH = '/cko-return';

/** Outcome of `POST /payments/complete`. */
export interface CompletionResult {
    status: 'complete' | 'failed';
    pending?: boolean;
    orderNo?: string | null;
    orderToken?: string | null;
    errorMessage?: string | null;
}

/** Absolute success and failure URLs for the payment session, on the storefront's own origin. */
export function getReturnUrls(request: Request, context: Context): { successUrl: string; failureUrl: string } {
    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}${buildUrlFromContext(RETURN_PATH, context)}`;

    return { successUrl: returnUrl, failureUrl: `${returnUrl}?leg=failure` };
}

/**
 * Make the basket carry exactly one CHECKOUTCOM_FLOW payment instrument for its
 * total. The template's place-order-prepare step keeps its amount in step with
 * the order total, and createOrder needs it.
 */
export async function ensurePaymentInstrument(context: Context, basket: Basket): Promise<Basket> {
    const basketId = basket.basketId;

    if (!basketId) {
        throw new Error('Basket has no basketId');
    }

    const current = await removeExtraPaymentInstruments(context, basket);

    if ((current.paymentInstruments ?? []).some((instrument) => instrument.paymentMethodId === PAYMENT_METHOD_ID)) {
        return current;
    }

    return addPaymentInstrumentToBasket(context, basketId, {
        paymentMethodId: PAYMENT_METHOD_ID,
        amount: current.orderTotal ?? current.productTotal ?? 0,
    });
}

/**
 * Remove every payment instrument except the first CHECKOUTCOM_FLOW one. Two
 * payment session requests running at the same time (React runs effects twice
 * in development; a double click does the same) can each add an instrument; a
 * second one would be copied into the order as an empty payment.
 */
export async function removeExtraPaymentInstruments(context: Context, basket: Basket): Promise<Basket> {
    if (!basket.basketId) {
        throw new Error('Basket has no basketId');
    }

    const instruments = basket.paymentInstruments ?? [];
    const keep = instruments.find((instrument) => instrument.paymentMethodId === PAYMENT_METHOD_ID);
    let current = basket;

    for (const instrument of instruments) {
        if (instrument !== keep && instrument.paymentInstrumentId) {
            current = await removePaymentInstrumentFromBasket(context, basket.basketId, instrument.paymentInstrumentId);
        }
    }

    return current;
}

/** Create the order from the basket through SCAPI Shopper Orders. */
export async function createOrder(context: Context, basketId: string): Promise<Order> {
    const clients = createApiClients(context);
    const { data: order } = await clients.shopperOrders.createOrder({ params: {}, body: { basketId } });

    if (!order.orderNo) {
        throw new Error('createOrder returned no orderNo');
    }

    return order;
}

/**
 * Fail an order that is still waiting for payment and reopen its basket, so the
 * shopper can try again. Returns false when there was nothing to fail.
 */
export async function failOrder(context: Context, orderNo: string): Promise<boolean> {
    const clients = createApiClients(context);

    try {
        const { data: order } = await clients.shopperOrders.getOrder({ params: { path: { orderNo } } });

        if (order.status !== 'created') {
            return false;
        }

        await clients.shopperOrders.failOrder({
            params: { path: { orderNo }, query: { reopenBasket: true } },
            body: { reasonCode: 'payment_confirm_failure' },
        });

        return true;
    } catch {
        return false;
    }
}

/**
 * Custom API: create the payment session for the basket. The basket is sent in
 * full because a Custom API script cannot load the shopper's basket itself.
 */
export async function createPaymentSession(
    context: Context,
    body: { basket: Basket; successUrl: string; failureUrl: string; locale?: string }
) {
    const clients = createApiClients(context);
    const { data } = await clients.checkoutcom.createPaymentSession({ params: {}, body });

    return data;
}

/** Custom API: submit the payment Flow collected, for an order. */
export async function submitPayment(
    context: Context,
    body: { sessionId: string; sessionData: string; orderNo: string }
) {
    const clients = createApiClients(context);
    const { data } = await clients.checkoutcom.submitPayment({ params: {}, body });

    return data;
}

/** Custom API: verify the payment and place its order. */
export async function completePayment(
    context: Context,
    body: { paymentId: string; orderNo?: string; basketId?: string }
): Promise<CompletionResult> {
    const clients = createApiClients(context);
    const { data } = await clients.checkoutcom.completePayment({ params: {}, body });

    return data as CompletionResult;
}
