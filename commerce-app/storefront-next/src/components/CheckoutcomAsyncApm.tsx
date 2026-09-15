/**
 * Asynchronous APM component (MB WAY, Bizum, ACH). The order is created but
 * not placed until the shopper approves in their banking app; the component
 * polls the payment-status custom endpoint until the webhook resolves it.
 */
import {useEffect, useState} from 'react'
import {addPaymentInstrument, createOrder, type ScapiConfig} from '../api/checkoutcom'
import {usePaymentStatus} from '../hooks/usePaymentStatus'
import type {CkoOrderOutcome, CkoPaymentMethodId} from '../types'

export interface CheckoutcomAsyncApmProps {
    config: ScapiConfig
    basketId: string
    amount: number
    paymentMethodId: Extract<CkoPaymentMethodId, 'CHECKOUTCOM_MBWAY' | 'CHECKOUTCOM_BIZUM' | 'CHECKOUTCOM_ACH'>
    /** Human-readable method label rendered while awaiting approval. */
    label: string
    onConfirmed: (outcome: CkoOrderOutcome) => void
    onFailed: () => void
    onError: (message: string) => void
    children?: React.ReactNode
}

export function CheckoutcomAsyncApm({
    config,
    basketId,
    amount,
    paymentMethodId,
    label,
    onConfirmed,
    onFailed,
    onError,
    children
}: CheckoutcomAsyncApmProps): React.JSX.Element {
    const [outcome, setOutcome] = useState<CkoOrderOutcome | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const status = usePaymentStatus({
        config,
        orderNo: outcome?.orderNo ?? '',
        orderToken: outcome?.orderToken ?? '',
        enabled: outcome !== null
    })

    useEffect(() => {
        if (!outcome) return
        if (status === 'confirmed') {
            onConfirmed(outcome)
        } else if (status === 'failed' || status === 'error') {
            onFailed()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, outcome])

    const handlePay = async (): Promise<void> => {
        if (submitting || outcome) return
        setSubmitting(true)
        try {
            await addPaymentInstrument(config, basketId, paymentMethodId, amount, {})
            setOutcome(await createOrder(config, basketId))
        } catch (submitError) {
            onError(submitError instanceof Error ? submitError.message : 'Payment failed')
        } finally {
            setSubmitting(false)
        }
    }

    if (outcome) {
        return (
            <div className="flex flex-col items-center gap-2 py-4" role="status">
                <span className="animate-pulse text-sm">Waiting for {label} approval…</span>
                <span className="text-xs text-muted-foreground">
                    Approve the payment in your banking app to complete the order.
                </span>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {children}
            <button
                type="button"
                onClick={handlePay}
                disabled={submitting}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
                {submitting ? 'Processing…' : `Pay with ${label}`}
            </button>
        </div>
    )
}
