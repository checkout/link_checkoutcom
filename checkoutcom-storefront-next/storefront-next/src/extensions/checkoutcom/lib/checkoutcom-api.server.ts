/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Client of the cartridge's `checkoutcom` Custom API (int_checkoutcom_next,
 * rest-apis/checkoutcom). It lives in the extension, rather than being
 * generated into the template with `sfnext scapi add`, so the extension works
 * as installed by the Commerce App with no change outside its folder.
 *
 * It calls the API like the template's own clients do: the shopper's SLAS
 * token, the session bridge id, the site id and the correlation id.
 */
import type { RouterContextProvider } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { AUTH_TOKEN_INVALID_ERROR, authContext, authStorageContext } from '@/middlewares/auth.utils';
import { correlationContext } from '@/lib/correlation';
import { getScapiBaseUrl } from '@/lib/utils';

type Context = Readonly<RouterContextProvider>;

/** The Custom API base path: api.json `checkoutcom`, version 1. */
const BASE_PATH = '/custom/checkoutcom/v1';

/** A non-2xx answer from the Custom API. */
export class CheckoutcomApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: unknown
    ) {
        super(`Checkout.com Custom API returned HTTP ${status}: ${JSON.stringify(body)}`);
        this.name = 'CheckoutcomApiError';
    }
}

/**
 * POST a JSON body to a Custom API operation.
 * @param path The operation path, e.g. /payment-sessions
 * @returns The JSON response
 * @throws CheckoutcomApiError on a non-2xx response
 */
export async function postCheckoutcomApi<T>(context: Context, path: string, body: unknown): Promise<T> {
    const { shortCode, organizationId } = getConfig(context).commerce.api;
    const siteId = context.get(siteContext)?.site?.id;

    if (!siteId) {
        throw new Error('Site context not initialized');
    }

    const session = await context.get(authContext).ref;

    if (!session?.accessToken) {
        throw new Error('No shopper session');
    }

    const url = new URL(`${getScapiBaseUrl(shortCode)}${BASE_PATH}/organizations/${organizationId}${path}`);

    url.searchParams.set('siteId', siteId);

    const headers = new Headers({
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-mobify': 'true',
    });

    if (session.dwsid) {
        headers.set('sfdc_dwsid', session.dwsid);
    }

    const correlationId = context.get(correlationContext);

    if (correlationId) {
        headers.set('correlation-id', correlationId);
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        if (response.status === 401) {
            // Same as the template's clients: let the auth middleware renew the session
            try {
                const authStorage = context.get(authStorageContext);

                if (authStorage && !authStorage.has('error')) {
                    authStorage.set('error', AUTH_TOKEN_INVALID_ERROR);
                }
            } catch {
                // auth storage is not available outside a request
            }
        }

        throw new CheckoutcomApiError(response.status, data);
    }

    return data as T;
}
