/**
 * Apple Pay component using the Apple Pay JS API (ApplePaySession).
 *
 * Unlike the SFRA integration — which relies on the platform
 * dw.extensions.applepay hooks and the <isapplepay> ISML tag (server-tag APIs
 * with no headless equivalent) — the headless flow runs entirely through
 * Apple Pay JS: the encrypted payment token is submitted through SCAPI and
 * the backend CHECKOUTCOM_APPLE_PAY processor forwards it to the gateway.
 *
 * Merchant validation requires a server endpoint that calls Apple's
 * validation URL with the merchant certificate; expose it in the Storefront
 * Next app server (MRT) and pass its path via validationEndpoint.
 */
import {useState} from 'react'
import {addPaymentInstrument, createOrder, type ScapiConfig} from '../api/checkoutcom'
import type {CkoOrderOutcome} from '../types'

export interface CheckoutcomApplePayProps {
    config: ScapiConfig
    basketId: string
    amount: number
    currencyCode: string
    countryCode: string
    merchantName: string
    /** MRT server route that performs Apple Pay merchant validation. */
    validationEndpoint: string
    onOrderPlaced: (outcome: CkoOrderOutcome) => void
    onError: (message: string) => void
}

export function CheckoutcomApplePay({
    config,
    basketId,
    amount,
    currencyCode,
    countryCode,
    merchantName,
    validationEndpoint,
    onOrderPlaced,
    onError
}: CheckoutcomApplePayProps): React.JSX.Element | null {
    const [submitting, setSubmitting] = useState(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ApplePaySession = (window as any).ApplePaySession
    if (!ApplePaySession || !ApplePaySession.canMakePayments()) {
        return null
    }

    const handleClick = (): void => {
        if (submitting) return
        const session = new ApplePaySession(3, {
            countryCode,
            currencyCode,
            supportedNetworks: ['visa', 'masterCard', 'amex'],
            merchantCapabilities: ['supports3DS'],
            total: {label: merchantName, amount: amount.toFixed(2)}
        })

        session.onvalidatemerchant = async (event: {validationURL: string}) => {
            try {
                const response = await fetch(validationEndpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({validationURL: event.validationURL})
                })
                session.completeMerchantValidation(await response.json())
            } catch {
                session.abort()
                onError('Apple Pay merchant validation failed')
            }
        }

        session.onpaymentauthorized = async (event: {payment: {token: unknown}}) => {
            setSubmitting(true)
            try {
                await addPaymentInstrument(config, basketId, 'CHECKOUTCOM_APPLE_PAY', amount, {
                    c_ckoToken: JSON.stringify(event.payment.token)
                })
                const outcome = await createOrder(config, basketId)
                session.completePayment(ApplePaySession.STATUS_SUCCESS)
                onOrderPlaced(outcome)
            } catch (payError) {
                session.completePayment(ApplePaySession.STATUS_FAILURE)
                onError(payError instanceof Error ? payError.message : 'Apple Pay failed')
            } finally {
                setSubmitting(false)
            }
        }

        session.begin()
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label="Pay with Apple Pay"
            className="apple-pay-button h-10 w-full rounded-md"
            style={{WebkitAppearance: '-apple-pay-button'} as React.CSSProperties}
        />
    )
}
