/**
 * Payment method selector bound to the checkout payment UI target. Renders
 * the Checkout.com methods that are enabled for the site and eligible for the
 * basket's country/currency (apm-eligibility custom endpoint), and mounts the
 * method-specific component for the shopper's selection.
 */
import {useEffect, useState} from 'react'
import {getApmEligibility, type ScapiConfig} from '../api/checkoutcom'
import {CheckoutcomApplePay} from './CheckoutcomApplePay'
import {CheckoutcomAsyncApm} from './CheckoutcomAsyncApm'
import {CheckoutcomCardPayment} from './CheckoutcomCardPayment'
import {CheckoutcomGooglePay} from './CheckoutcomGooglePay'
import {CheckoutcomRedirectApm} from './CheckoutcomRedirectApm'
import type {CkoOrderOutcome, CkoPaymentMethodId} from '../types'

interface MethodDescriptor {
    id: CkoPaymentMethodId
    label: string
    /** apm-eligibility key; undefined methods are always shown. */
    eligibilityKey?: string
    kind: 'card' | 'wallet-google' | 'wallet-apple' | 'redirect' | 'async'
    contextType?: 'klarna' | 'tabby'
}

// PayPal is intentionally absent: its headless flow requires the PayPal JS SDK
// buttons plus the payment-context approval leg and is tracked as follow-up work.
const METHODS: MethodDescriptor[] = [
    {id: 'CREDIT_CARD', label: 'Card', kind: 'card'},
    {id: 'CHECKOUTCOM_GOOGLE_PAY', label: 'Google Pay', kind: 'wallet-google'},
    {id: 'CHECKOUTCOM_APPLE_PAY', label: 'Apple Pay', kind: 'wallet-apple'},
    {id: 'CHECKOUTCOM_KLARNA', label: 'Klarna', kind: 'redirect', contextType: 'klarna', eligibilityKey: 'klarna'},
    {id: 'CHECKOUTCOM_TABBY', label: 'Tabby', kind: 'redirect', contextType: 'tabby', eligibilityKey: 'tabby'},
    {id: 'CHECKOUTCOM_ALMA', label: 'Alma', kind: 'redirect', eligibilityKey: 'alma'},
    {id: 'CHECKOUTCOM_SEQURA', label: 'Sequra', kind: 'redirect', eligibilityKey: 'sequra'},
    {id: 'CHECKOUTCOM_MBWAY', label: 'MB WAY', kind: 'async', eligibilityKey: 'mbway'},
    {id: 'CHECKOUTCOM_BIZUM', label: 'Bizum', kind: 'async', eligibilityKey: 'bizum'},
    {id: 'CHECKOUTCOM_ACH', label: 'ACH Direct Debit', kind: 'async', eligibilityKey: 'ach'}
]

export interface CheckoutcomPaymentMethodsProps {
    config: ScapiConfig
    basketId: string
    amount: number
    currencyCode: string
    countryCode: string
    publicKey: string
    merchantName: string
    environment: 'TEST' | 'PRODUCTION'
    locale?: string
    allowSaveCard?: boolean
    deviceSessionId?: string
    applePayValidationEndpoint?: string
    onOrderPlaced: (outcome: CkoOrderOutcome) => void
    onRedirect: (redirectUrl: string, outcome: CkoOrderOutcome) => void
    onFailed: () => void
    onError: (message: string) => void
}

export function CheckoutcomPaymentMethods(props: CheckoutcomPaymentMethodsProps): React.JSX.Element {
    const {config, basketId} = props
    const [eligibility, setEligibility] = useState<Record<string, boolean> | null>(null)
    const [selected, setSelected] = useState<CkoPaymentMethodId>('CREDIT_CARD')

    useEffect(() => {
        let active = true
        getApmEligibility(config, props.countryCode, props.currencyCode)
            .then((response) => {
                if (active) setEligibility(response.methods)
            })
            .catch(() => {
                // Without eligibility data, show only the always-available methods
                if (active) setEligibility({})
            })
        return () => {
            active = false
        }
    }, [config, props.countryCode, props.currencyCode])

    const available = METHODS.filter(
        (method) => !method.eligibilityKey || (eligibility ? eligibility[method.eligibilityKey] === true : false)
    )

    const renderSelected = (method: MethodDescriptor): React.JSX.Element | null => {
        switch (method.kind) {
            case 'card':
                return (
                    <CheckoutcomCardPayment
                        config={config}
                        basketId={basketId}
                        amount={props.amount}
                        publicKey={props.publicKey}
                        locale={props.locale}
                        allowSaveCard={props.allowSaveCard}
                        deviceSessionId={props.deviceSessionId}
                        onOrderPlaced={props.onOrderPlaced}
                        onRedirect={props.onRedirect}
                        onError={props.onError}
                    />
                )
            case 'wallet-google':
                return (
                    <CheckoutcomGooglePay
                        config={config}
                        basketId={basketId}
                        amount={props.amount}
                        currencyCode={props.currencyCode}
                        environment={props.environment}
                        gatewayMerchantId={props.publicKey}
                        merchantName={props.merchantName}
                        onOrderPlaced={props.onOrderPlaced}
                        onRedirect={props.onRedirect}
                        onError={props.onError}
                    />
                )
            case 'wallet-apple':
                return props.applePayValidationEndpoint ? (
                    <CheckoutcomApplePay
                        config={config}
                        basketId={basketId}
                        amount={props.amount}
                        currencyCode={props.currencyCode}
                        countryCode={props.countryCode}
                        merchantName={props.merchantName}
                        validationEndpoint={props.applePayValidationEndpoint}
                        onOrderPlaced={props.onOrderPlaced}
                        onError={props.onError}
                    />
                ) : null
            case 'redirect':
                return (
                    <CheckoutcomRedirectApm
                        config={config}
                        basketId={basketId}
                        amount={props.amount}
                        paymentMethodId={method.id}
                        label={method.label}
                        contextType={method.contextType}
                        onRedirect={props.onRedirect}
                        onOrderPlaced={props.onOrderPlaced}
                        onError={props.onError}
                    />
                )
            case 'async':
                return (
                    <CheckoutcomAsyncApm
                        config={config}
                        basketId={basketId}
                        amount={props.amount}
                        paymentMethodId={method.id as 'CHECKOUTCOM_MBWAY' | 'CHECKOUTCOM_BIZUM' | 'CHECKOUTCOM_ACH'}
                        label={method.label}
                        onConfirmed={props.onOrderPlaced}
                        onFailed={props.onFailed}
                        onError={props.onError}
                    />
                )
            default:
                return null
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Payment method</legend>
                {available.map((method) => (
                    <label key={method.id} className="flex items-center gap-2 text-sm">
                        <input
                            type="radio"
                            name="cko-payment-method"
                            checked={selected === method.id}
                            onChange={() => setSelected(method.id)}
                        />
                        {method.label}
                    </label>
                ))}
            </fieldset>
            {available
                .filter((method) => method.id === selected)
                .map((method) => (
                    <div key={method.id}>{renderSelected(method)}</div>
                ))}
        </div>
    )
}
