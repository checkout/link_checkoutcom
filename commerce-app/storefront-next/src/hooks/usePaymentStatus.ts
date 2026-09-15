/**
 * Polling hook for asynchronous payment methods (MB WAY, Bizum, ACH).
 * The backend webhook resolves the payment; this hook polls the
 * payment-status custom endpoint until the outcome is known.
 */
import {useEffect, useRef, useState} from 'react'
import {getPaymentStatus, type ScapiConfig} from '../api/checkoutcom'
import type {CkoAsyncPaymentStatus} from '../types'

export interface UsePaymentStatusOptions {
    config: ScapiConfig
    orderNo: string
    orderToken: string
    /** Poll interval in milliseconds. Default 3000. */
    intervalMs?: number
    /** Give up after this many milliseconds. Default 10 minutes. */
    timeoutMs?: number
    enabled: boolean
}

export function usePaymentStatus({
    config,
    orderNo,
    orderToken,
    intervalMs = 3000,
    timeoutMs = 600000,
    enabled
}: UsePaymentStatusOptions): CkoAsyncPaymentStatus {
    const [status, setStatus] = useState<CkoAsyncPaymentStatus>('pending')
    const startedAt = useRef<number>(Date.now())

    useEffect(() => {
        if (!enabled || status !== 'pending') {
            return undefined
        }
        startedAt.current = Date.now()
        let active = true

        const timer = setInterval(async () => {
            if (Date.now() - startedAt.current > timeoutMs) {
                clearInterval(timer)
                if (active) setStatus('error')
                return
            }
            try {
                const response = await getPaymentStatus(config, orderNo, orderToken)
                if (active && response.status !== 'pending') {
                    clearInterval(timer)
                    setStatus(response.status)
                }
            } catch {
                // transient failure — keep polling until timeout
            }
        }, intervalMs)

        return () => {
            active = false
            clearInterval(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, orderNo, orderToken, intervalMs, timeoutMs])

    return status
}
