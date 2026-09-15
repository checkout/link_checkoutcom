/**
 * Gateway return-leg component. Mount this on the route configured as the
 * ckoReturnSuccessUrl / ckoReturnFailureUrl site preference (e.g.
 * /checkout/cko-return). It completes the payment via the return custom
 * endpoint using the cko-session-id the gateway appends to the URL.
 *
 * In a Storefront Next app, prefer running completeReturn() in the route
 * loader and redirecting server-side; this component is the client-side
 * equivalent for apps that have not added a dedicated loader yet.
 */
import {useEffect, useRef, useState} from 'react'
import {completeReturn, type ScapiConfig} from '../api/checkoutcom'

export interface CheckoutcomReturnHandlerProps {
    config: ScapiConfig
    /** Whether this route is the success or failure return leg. */
    leg: 'success' | 'failure'
    onConfirmed: (orderNo: string) => void
    onFailed: () => void
}

export function CheckoutcomReturnHandler({
    config,
    leg,
    onConfirmed,
    onFailed
}: CheckoutcomReturnHandlerProps): React.JSX.Element {
    const [message, setMessage] = useState('Completing your payment…')
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true

        const ckoSessionId = new URLSearchParams(window.location.search).get('cko-session-id')
        if (!ckoSessionId) {
            setMessage('Missing payment session.')
            onFailed()
            return
        }

        completeReturn(config, ckoSessionId, leg === 'success')
            .then((result) => {
                if (result.outcome === 'confirmed' && result.orderNo) {
                    onConfirmed(result.orderNo)
                } else {
                    setMessage('Your payment could not be completed.')
                    onFailed()
                }
            })
            .catch(() => {
                setMessage('Your payment could not be completed.')
                onFailed()
            })
    }, [config, leg, onConfirmed, onFailed])

    return (
        <div className="flex flex-col items-center gap-2 py-8" role="status">
            <span className="animate-pulse text-sm">{message}</span>
        </div>
    )
}
