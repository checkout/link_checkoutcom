/**
 * Google Pay component. Collects an encrypted Google Pay token via the
 * Google Pay JS API and submits it through SCAPI; the backend
 * CHECKOUTCOM_GOOGLE_PAY processor forwards it to the gateway.
 */
import {useEffect, useRef, useState} from 'react'
import {addPaymentInstrument, createOrder, type ScapiConfig} from '../api/checkoutcom'
import type {CkoOrderOutcome} from '../types'

const GOOGLE_PAY_SRC = 'https://pay.google.com/gp/p/js/pay.js'

export interface CheckoutcomGooglePayProps {
    config: ScapiConfig
    basketId: string
    amount: number
    currencyCode: string
    /** 'TEST' for sandbox, 'PRODUCTION' for live. */
    environment: 'TEST' | 'PRODUCTION'
    /** Checkout.com public key — used as the gateway merchant id. */
    gatewayMerchantId: string
    merchantName: string
    onOrderPlaced: (outcome: CkoOrderOutcome) => void
    onRedirect: (redirectUrl: string, outcome: CkoOrderOutcome) => void
    onError: (message: string) => void
}

export function CheckoutcomGooglePay({
    config,
    basketId,
    amount,
    currencyCode,
    environment,
    gatewayMerchantId,
    merchantName,
    onOrderPlaced,
    onRedirect,
    onError
}: CheckoutcomGooglePayProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const existing = document.querySelector(`script[src="${GOOGLE_PAY_SRC}"]`)
        if (existing) {
            setReady(true)
            return
        }
        const script = document.createElement('script')
        script.src = GOOGLE_PAY_SRC
        script.async = true
        script.onload = () => setReady(true)
        document.head.appendChild(script)
    }, [])

    useEffect(() => {
        if (!ready || !containerRef.current) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const google = (window as any).google
        if (!google?.payments?.api) return

        const client = new google.payments.api.PaymentsClient({environment})
        const paymentRequest = {
            apiVersion: 2,
            apiVersionMinor: 0,
            allowedPaymentMethods: [
                {
                    type: 'CARD',
                    parameters: {
                        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                        allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX']
                    },
                    tokenizationSpecification: {
                        type: 'PAYMENT_GATEWAY',
                        parameters: {
                            gateway: 'checkoutltd',
                            gatewayMerchantId
                        }
                    }
                }
            ],
            merchantInfo: {merchantName},
            transactionInfo: {
                totalPriceStatus: 'FINAL',
                totalPrice: amount.toFixed(2),
                currencyCode
            }
        }

        const button = client.createButton({
            onClick: async () => {
                try {
                    const paymentData = await client.loadPaymentData(paymentRequest)
                    const token = paymentData.paymentMethodData.tokenizationData.token as string
                    await addPaymentInstrument(config, basketId, 'CHECKOUTCOM_GOOGLE_PAY', amount, {
                        c_ckoToken: token
                    })
                    const outcome = await createOrder(config, basketId)
                    if (outcome.redirectUrl) {
                        onRedirect(outcome.redirectUrl, outcome)
                    } else {
                        onOrderPlaced(outcome)
                    }
                } catch (payError) {
                    if ((payError as {statusCode?: string}).statusCode !== 'CANCELED') {
                        onError(payError instanceof Error ? payError.message : 'Google Pay failed')
                    }
                }
            }
        })

        const container = containerRef.current
        container.replaceChildren(button)
        return () => container.replaceChildren()
    }, [ready, amount, currencyCode, basketId]) // eslint-disable-line react-hooks/exhaustive-deps

    return <div ref={containerRef} />
}
