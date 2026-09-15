/**
 * Redirect APM component (Klarna, Tabby, Alma, Sequra, PayPal and generic
 * APMs). Adds the instrument, creates the order and forwards the shopper to
 * the gateway-hosted page returned as c_ckoRedirectUrl. Klarna/Tabby/PayPal
 * flows first create a payment context via the custom endpoint.
 */
import {useState} from 'react'
import {
    addPaymentInstrument,
    createOrder,
    createPaymentContext,
    type ScapiConfig
} from '../api/checkoutcom'
import type {CkoOrderOutcome, CkoPaymentInstrumentCustomProps, CkoPaymentMethodId} from '../types'

export interface CheckoutcomRedirectApmProps {
    config: ScapiConfig
    basketId: string
    amount: number
    paymentMethodId: CkoPaymentMethodId
    label: string
    /** Set for context-based methods so the context id rides on the instrument. */
    contextType?: 'klarna' | 'tabby'
    /** Extra instrument custom properties (e.g. c_sequraProductType). */
    customProps?: CkoPaymentInstrumentCustomProps
    /** Called before redirecting so the app can persist checkout state. */
    onRedirect: (redirectUrl: string, outcome: CkoOrderOutcome) => void
    /** Called when authorization succeeds without a redirect. */
    onOrderPlaced: (outcome: CkoOrderOutcome) => void
    onError: (message: string) => void
}

export function CheckoutcomRedirectApm({
    config,
    basketId,
    amount,
    paymentMethodId,
    label,
    contextType,
    customProps,
    onRedirect,
    onOrderPlaced,
    onError
}: CheckoutcomRedirectApmProps): React.JSX.Element {
    const [submitting, setSubmitting] = useState(false)

    const handlePay = async (): Promise<void> => {
        if (submitting) return
        setSubmitting(true)
        try {
            const props: CkoPaymentInstrumentCustomProps = {...customProps}
            if (contextType) {
                const context = await createPaymentContext(config, contextType)
                if (contextType === 'tabby') {
                    props.c_ckoTabbyContextId = context.id
                    props.c_ckoTabbyPaymentType = context.paymentType
                }
            }
            await addPaymentInstrument(config, basketId, paymentMethodId, amount, props)
            const outcome = await createOrder(config, basketId)
            if (outcome.redirectUrl) {
                onRedirect(outcome.redirectUrl, outcome)
            } else {
                onOrderPlaced(outcome)
            }
        } catch (submitError) {
            onError(submitError instanceof Error ? submitError.message : 'Payment failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handlePay}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
            {submitting ? 'Processing…' : `Pay with ${label}`}
        </button>
    )
}
