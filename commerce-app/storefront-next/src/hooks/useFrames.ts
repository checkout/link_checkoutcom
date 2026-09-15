/**
 * React hook wrapping Checkout.com Frames (hosted card fields).
 * Card data never touches the storefront or the B2C instance: Frames renders
 * the PAN/expiry/CVV fields in Checkout.com-hosted iframes and exchanges them
 * for a single-use token submitted through SCAPI.
 */
import {useCallback, useEffect, useRef, useState} from 'react'
import type {CkoCardToken} from '../types'

const FRAMES_SRC = 'https://cdn.checkout.com/js/framesv2.min.js'

interface FramesStatic {
    init(config: {publicKey: string; localization?: string}): void
    isCardValid(): boolean
    submitCard(): Promise<{token: string; bin?: string; scheme?: string; expires_on?: string}>
    addEventHandler(event: string, handler: (event: unknown) => void): void
    removeAllEventHandlers(event: string): void
    Events: {
        CARD_VALIDATION_CHANGED: string
        CARD_TOKENIZED: string
        CARD_TOKENIZATION_FAILED: string
    }
}

declare global {
    interface Window {
        Frames?: FramesStatic
    }
}

let framesScriptPromise: Promise<FramesStatic> | null = null

function loadFrames(): Promise<FramesStatic> {
    if (window.Frames) {
        return Promise.resolve(window.Frames)
    }
    if (!framesScriptPromise) {
        framesScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = FRAMES_SRC
            script.async = true
            script.onload = () => {
                if (window.Frames) {
                    resolve(window.Frames)
                } else {
                    reject(new Error('Frames failed to initialize'))
                }
            }
            script.onerror = () => reject(new Error('Failed to load Frames script'))
            document.head.appendChild(script)
        })
    }
    return framesScriptPromise
}

export interface UseFramesOptions {
    /** Checkout.com public key (from the merchant's site configuration). */
    publicKey: string
    /** BCP 47 locale for field localization. */
    locale?: string
}

export interface UseFramesResult {
    /** Whether the Frames script has loaded and fields are mounted. */
    ready: boolean
    /** Whether the entered card is currently valid. */
    cardValid: boolean
    /** Tokenize the entered card. Resolves with the single-use token. */
    tokenize: () => Promise<CkoCardToken>
    error: string | null
}

/**
 * Mount Frames hosted fields. The consuming component must render elements
 * with the Frames placeholder classes inside a <form>:
 * .card-number-frame, .expiry-date-frame, .cvv-frame
 */
export function useFrames({publicKey, locale}: UseFramesOptions): UseFramesResult {
    const [ready, setReady] = useState(false)
    const [cardValid, setCardValid] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const framesRef = useRef<FramesStatic | null>(null)

    useEffect(() => {
        let cancelled = false
        loadFrames()
            .then((frames) => {
                if (cancelled) return
                frames.init({publicKey, localization: locale})
                frames.addEventHandler(frames.Events.CARD_VALIDATION_CHANGED, () => {
                    setCardValid(frames.isCardValid())
                })
                framesRef.current = frames
                setReady(true)
            })
            .catch((loadError: Error) => {
                if (!cancelled) setError(loadError.message)
            })
        return () => {
            cancelled = true
            const frames = framesRef.current
            if (frames) {
                frames.removeAllEventHandlers(frames.Events.CARD_VALIDATION_CHANGED)
            }
        }
    }, [publicKey, locale])

    const tokenize = useCallback(async (): Promise<CkoCardToken> => {
        const frames = framesRef.current
        if (!frames) {
            throw new Error('Frames is not ready')
        }
        const result = await frames.submitCard()
        return {
            token: result.token,
            bin: result.bin,
            scheme: result.scheme,
            expiresOn: result.expires_on
        }
    }, [])

    return {ready, cardValid, tokenize, error}
}
