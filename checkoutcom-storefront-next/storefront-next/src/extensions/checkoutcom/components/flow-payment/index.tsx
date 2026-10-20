/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Checkout.com Flow at the checkout payment step (`sfcc.checkout.payment.paymentMethods`).
 *
 * Order-first sequence (the order exists before money moves, and the payment
 * reference is the order number):
 *
 *   payment step   session created from the basket, Flow mounted (own pay button hidden)
 *   Place Order    template runs place-order-prepare, then onPlaceOrder -> flow.submit()
 *   handleSubmit   create the order, submit the payment (reference = orderNo), return the response to Flow
 *   completed      verify + place the order, resolve onPlaceOrder(orderNo); template finalizes
 *   redirect       3DS / redirect methods leave the page; routes/_empty.cko-return.tsx completes
 *   failure        fail the order (basket reopened), resolve onPlaceOrder(null) with an error
 *
 * Wallets (Apple Pay, Google Pay) cannot be started with flow.submit(); their
 * buttons pay directly. If they go through handleSubmit, the same order-first
 * path runs and this component calls place-order-prepare / -finalize itself.
 * If they bypass it, the instance creates the order from the basket on
 * completion (see the cartridge's completeWithoutOrder).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useBasket } from '@/providers/basket';
import { usePaymentSubmissionRef } from '@/components/checkout/payment-submission-context';
import { createLogger } from '@/lib/logger';
import {
    loadCheckoutWebComponents,
    type CheckoutInstance,
    type FlowComponent,
    type SubmitData,
} from '@/extensions/checkoutcom/lib/checkout-web-components';
import { buildFlowOptions, type FlowConfigInput } from '@/extensions/checkoutcom/lib/flow-config';
import { getThemeAppearance } from '@/extensions/checkoutcom/lib/flow-theme';

/** The longest a Place Order may wait for Flow (3DS challenges can take minutes). */
const PLACE_ORDER_TIMEOUT_MS = 5 * 60 * 1000;

/** The longest the payment step may show "Loading payment methods" before reporting why. */
const LOAD_TIMEOUT_MS = 30 * 1000;

const logger = createLogger({ extension: 'checkoutcom' });

/** Loading steps, reported in the browser console when Flow does not appear. */
type LoadStage = 'basket' | 'session' | 'script' | 'init' | 'mount';

interface SessionResponse {
    paymentSession: { id: string } & Record<string, unknown>;
    publicKey: string;
    environment: 'sandbox' | 'production';
    appearance?: Record<string, unknown> | null;
    componentOptions?: Record<string, unknown> | null;
    translations?: Record<string, Record<string, string>> | null;
}

interface CompletionResult {
    status: 'complete' | 'failed';
    orderNo?: string | null;
    errorMessage?: string | null;
}

/**
 * The session request in flight, shared by concurrent mounts of the component:
 * React mounts effects twice in development, and two parallel requests would
 * each add a payment instrument to the basket.
 */
let sessionInFlight: { key: string; promise: Promise<{ ok: boolean; data: SessionResponse }> } | null = null;

function requestSession(key: string, locale: string): Promise<{ ok: boolean; data: SessionResponse }> {
    if (sessionInFlight?.key !== key) {
        const promise = postJson<SessionResponse>('/action/checkoutcom-session', { locale });

        sessionInFlight = { key, promise };
        void promise.finally(() => {
            if (sessionInFlight?.promise === promise) {
                sessionInFlight = null;
            }
        });
    }

    return sessionInFlight.promise;
}

/** Convert an amount to minor units with the currency's own number of decimals (JPY has none). */
function toMinorUnits(amount: number, currency: string): number {
    const digits =
        new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

    return Math.round(amount * 10 ** digits);
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T }> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T;

    return { ok: response.ok, data };
}

async function postForm<T>(url: string, fields: Record<string, string>): Promise<{ ok: boolean; data: T }> {
    const form = new FormData();

    Object.entries(fields).forEach(([key, value]) => form.append(key, value));

    const response = await fetch(url, { method: 'POST', body: form });
    const data = (await response.json().catch(() => ({}))) as T;

    return { ok: response.ok, data };
}

export default function CheckoutcomFlowPayment() {
    const { t, i18n } = useTranslation('extCheckoutcom');
    const basket = useBasket();
    const paymentSubmissionRef = usePaymentSubmissionRef();

    const containerRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<FlowComponent | null>(null);
    const checkoutRef = useRef<CheckoutInstance | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const orderNoRef = useRef<string | null>(null);
    const placeOrderRef = useRef<((orderNo: string | null) => void) | null>(null);
    const stageRef = useRef<LoadStage>('basket');
    // The basket flow-options.ts receives, current when Flow mounts
    const basketRef = useRef(basket);

    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const returnErrorCode = searchParams.get('paymentError');

    // The outcome of a 3DS or redirect payment that came back unsuccessful. Kept
    // apart from `error`, which is reset whenever Flow (re)mounts, so the shopper
    // sees it until they try again.
    const [returnError, setReturnError] = useState<string | null>(null);

    useEffect(() => {
        if (!returnErrorCode) {
            return;
        }

        // The return route sends ?paymentError=<code> when a 3DS or redirect payment
        // did not complete (routes/_empty.cko-return.tsx); every code means the same
        setReturnError(t('errors.returnFailed'));

        // Drop the code from the address bar so a reload does not show it again
        const url = new URL(window.location.href);

        url.searchParams.delete('paymentError');
        window.history.replaceState(window.history.state, '', url.toString());
    }, [returnErrorCode, t]);

    useEffect(() => {
        basketRef.current = basket;
    }, [basket]);

    const basketId = basket?.basketId;
    const orderTotal = basket?.orderTotal;
    const currency = basket?.currency;
    const hasTotal = orderTotal != null;
    const locale = i18n.language;

    /** End the current attempt: resolve a pending Place Order and show the message. */
    const fail = useCallback((message: string) => {
        setError(message);
        placeOrderRef.current?.(null);
        placeOrderRef.current = null;
    }, []);

    /** Give the shopper their basket back after a failed attempt. */
    const failOrder = useCallback(async () => {
        const orderNo = orderNoRef.current;

        orderNoRef.current = null;

        if (orderNo) {
            await postJson('/action/checkoutcom-fail-order', { orderNo });
        }
    }, []);

    /** Hand the placed order to the template, or finalize it ourselves (wallet path). */
    const settle = useCallback(async (orderNo: string) => {
        const resolve = placeOrderRef.current;

        placeOrderRef.current = null;
        orderNoRef.current = null;

        if (resolve) {
            resolve(orderNo);

            return;
        }

        const { data } = await postForm<{ redirectUrl?: string }>('/action/place-order-finalize', { orderNo });

        if (data.redirectUrl) {
            window.location.assign(data.redirectUrl);
        }
    }, []);

    // Never leave the shopper on "Loading" silently: report the step that is stuck
    useEffect(() => {
        if (status !== 'loading') {
            return undefined;
        }

        const timer = setTimeout(() => {
            logger.error('Flow did not load in time', {
                step: stageRef.current,
                basketId,
                orderTotal,
                hint:
                    stageRef.current === 'basket'
                        ? 'The basket has no order total yet: check taxes and the shipping method can be calculated for this site.'
                        : undefined,
            });
            setStatus('error');
            setError(t('errors.unavailable'));
        }, LOAD_TIMEOUT_MS);

        return () => clearTimeout(timer);
    }, [status, basketId, orderTotal, t]);

    // Create the payment session and mount Flow; again whenever the total changes
    useEffect(() => {
        if (!basketId || !hasTotal) {
            stageRef.current = 'basket';

            return undefined;
        }

        let cancelled = false;
        let mounted: FlowComponent | null = null;

        setStatus('loading');
        setError(null);

        void (async () => {
            try {
                stageRef.current = 'session';

                const session = await requestSession(`${basketId}:${currency}`, locale);

                if (!session.ok || !session.data.paymentSession?.id) {
                    throw new Error(`payment session request failed: ${JSON.stringify(session.data)}`);
                }

                stageRef.current = 'script';

                const load = await loadCheckoutWebComponents();

                if (cancelled) {
                    return;
                }

                sessionIdRef.current = session.data.paymentSession.id;
                stageRef.current = 'init';

                const own: FlowConfigInput['own'] = {
                    handleSubmit: async (_component, submitData: SubmitData) => {
                        // A wallet started the payment without Place Order: run the
                        // template's pre-flight (validation, totals) first.
                        if (!placeOrderRef.current) {
                            const prepared = await postForm('/action/place-order-prepare', {});

                            if (!prepared.ok) {
                                fail(t('errors.placeOrder'));
                                throw new Error('place-order-prepare failed');
                            }
                        }

                        const submitted = await postJson<{ orderNo?: string; response?: unknown; error?: string }>(
                            '/action/checkoutcom-submit',
                            {
                                sessionId: sessionIdRef.current,
                                sessionData: submitData.session_data,
                                orderNo: orderNoRef.current ?? undefined,
                            }
                        );

                        if (!submitted.ok || !submitted.data.orderNo) {
                            orderNoRef.current = null;
                            fail(t('errors.payment'));
                            throw new Error(submitted.data.error ?? 'submit failed');
                        }

                        orderNoRef.current = submitted.data.orderNo;

                        return submitted.data.response;
                    },

                    onPaymentCompleted: async (_component, payment) => {
                        const completed = await postJson<CompletionResult>('/action/checkoutcom-complete', {
                            paymentId: payment.id,
                            orderNo: orderNoRef.current ?? undefined,
                        });

                        if (completed.data.status === 'complete' && completed.data.orderNo) {
                            await settle(completed.data.orderNo);
                        } else {
                            // The instance already failed the order and reopened the basket
                            orderNoRef.current = null;
                            fail(completed.data.errorMessage ?? t('errors.payment'));
                        }
                    },

                    onError: async () => {
                        await failOrder();
                        fail(t('errors.payment'));
                    },
                };
                const flowOptions = (theme: Record<string, unknown>) =>
                    buildFlowOptions({
                        session: session.data,
                        theme,
                        locale,
                        context: { basket: basketRef.current, locale },
                        own,
                    });

                let checkout: CheckoutInstance;

                try {
                    checkout = await load(flowOptions(getThemeAppearance()));
                } catch (themeError) {
                    // Never let the storefront theme mapping block payment
                    logger.warn('Flow did not start with the storefront theme; starting with its default styling', {
                        error: String(themeError),
                    });
                    checkout = await load(flowOptions({}));
                }

                if (cancelled || !containerRef.current) {
                    return;
                }

                stageRef.current = 'mount';
                checkoutRef.current = checkout;
                mounted = checkout.create('flow', { showPayButton: false });

                if (!(await mounted.isAvailable())) {
                    throw new Error('unavailable');
                }

                mounted.mount(containerRef.current);
                flowRef.current = mounted;
                setStatus('ready');
            } catch (loadError) {
                if (!cancelled) {
                    logger.error('Flow failed to load', { step: stageRef.current, error: String(loadError) });
                    setStatus('error');
                    setError(t('errors.unavailable'));
                }
            }
        })();

        return () => {
            cancelled = true;
            flowRef.current = null;
            checkoutRef.current = null;
            mounted?.unmount();
        };
    }, [basketId, hasTotal, currency, locale, t, fail, failOrder, settle]);

    // When shipping or taxes change the total while Flow is mounted, update the
    // amount Flow shows instead of creating a new session (which would clear what
    // the shopper typed). The amount charged is the order total, set at submission.
    useEffect(() => {
        const checkout = checkoutRef.current;

        if (status !== 'ready' || !checkout?.update || orderTotal == null || !currency) {
            return;
        }

        checkout.update({ amount: toMinorUnits(orderTotal, currency) });
    }, [status, orderTotal, currency]);

    // Let the template's Place Order button drive the payment
    useEffect(() => {
        const submission = paymentSubmissionRef.current;

        if (!submission) {
            return undefined;
        }

        submission.onPlaceOrder = () =>
            new Promise<string | null>((resolve) => {
                const flow = flowRef.current;

                setError(null);
                setReturnError(null);

                if (!flow || !flow.isValid()) {
                    setError(t('errors.incomplete'));
                    resolve(null);

                    return;
                }

                const timer = setTimeout(() => fail(t('errors.timeout')), PLACE_ORDER_TIMEOUT_MS);

                placeOrderRef.current = (orderNo) => {
                    clearTimeout(timer);
                    resolve(orderNo);
                };

                // Redirect methods and 3DS leave the page here; the return route completes
                flow.submit();
            });

        return () => {
            submission.onPlaceOrder = null;
        };
    }, [paymentSubmissionRef, t, fail]);

    return (
        <div className="flex flex-col gap-4" data-testid="checkoutcom-flow">
            {returnError || error ? (
                <div
                    className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                    role="alert"
                    data-testid="checkoutcom-error">
                    {returnError ?? error}
                </div>
            ) : null}
            <div ref={containerRef} />
            {status === 'loading' ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
        </div>
    );
}
