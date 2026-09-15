/**
 * Card payment component backed by Checkout.com Frames hosted fields.
 * Flow: tokenize client-side → add payment instrument via SCAPI (c_ckoToken)
 * → create order → follow c_ckoRedirectUrl for 3DS when present.
 */
import {useState} from 'react'
import {addPaymentInstrument, createOrder, type ScapiConfig} from '../api/checkoutcom'
import {useFrames} from '../hooks/useFrames'
import type {CkoOrderOutcome} from '../types'

export interface CheckoutcomCardPaymentProps {
    config: ScapiConfig
    basketId: string
    /** Basket total in the basket currency's major units. */
    amount: number
    /** Checkout.com public key from merchant configuration. */
    publicKey: string
    locale?: string
    /** Whether to offer saving the card for registered shoppers. */
    allowSaveCard?: boolean
    /** Risk.js device session id when device fingerprinting is enabled. */
    deviceSessionId?: string
    /** Called when the order is placed synchronously (no 3DS challenge). */
    onOrderPlaced: (outcome: CkoOrderOutcome) => void
    /** Called when the shopper must be redirected to a 3DS challenge. */
    onRedirect: (redirectUrl: string, outcome: CkoOrderOutcome) => void
    onError: (message: string) => void
}

export function CheckoutcomCardPayment({
    config,
    basketId,
    amount,
    publicKey,
    locale,
    allowSaveCard = false,
    deviceSessionId,
    onOrderPlaced,
    onRedirect,
    onError
}: CheckoutcomCardPaymentProps): React.JSX.Element {
    const {ready, cardValid, tokenize, error} = useFrames({publicKey, locale})
    const [saveCard, setSaveCard] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault()
        if (!cardValid || submitting) return
        setSubmitting(true)
        try {
            const cardToken = await tokenize()
            await addPaymentInstrument(config, basketId, 'CREDIT_CARD', amount, {
                c_ckoToken: cardToken.token,
                c_cardBin: cardToken.bin,
                c_cardType: cardToken.scheme,
                c_saveCard: saveCard,
                c_deviceSessionId: deviceSessionId
            })
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-busy={submitting}>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <label className="flex flex-col gap-1 text-sm font-medium">
                Card number
                <div className="card-number-frame h-10 rounded-md border px-3" />
            </label>
            <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                    Expiry date
                    <div className="expiry-date-frame h-10 rounded-md border px-3" />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                    Security code
                    <div className="cvv-frame h-10 rounded-md border px-3" />
                </label>
            </div>

            {allowSaveCard ? (
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={saveCard}
                        onChange={(event) => setSaveCard(event.target.checked)}
                    />
                    Save this card for future purchases
                </label>
            ) : null}

            <button
                type="submit"
                disabled={!ready || !cardValid || submitting}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
                {submitting ? 'Processing…' : 'Pay now'}
            </button>
        </form>
    )
}
