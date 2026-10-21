/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Content Security Policy contributor for Checkout.com Flow: the exact hosts
 * Flow loads its script from, calls, frames and loads images from (Checkout.com's
 * documented list). Register it in src/middlewares/security-headers.server.ts:
 *
 *     // @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
 *     import { createCheckoutcomCspContributor } from '@/extensions/checkoutcom/lib/csp-contributor';
 *     ...
 *     const contributors = [
 *         ...
 *         // @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
 *         createCheckoutcomCspContributor(),
 *     ];
 *
 * Production and sandbox hosts are both contributed: the policy is built when
 * the storefront starts, while the Checkout.com mode is a Business Manager
 * preference that can change at any time.
 */
import type { CspContribution, CspContributor } from '@salesforce/storefront-next-runtime/security';

/** Hosts per directive, without the environment part (`.checkout.com` / `.sandbox.checkout.com`). */
const HOSTS: Record<'script-src' | 'connect-src' | 'frame-src' | 'img-src', string[]> = {
    'script-src': ['checkout-web-components', 'risk'],
    'connect-src': ['api', 'devices.api', 'checkout-web-components-events', 'risk'],
    'frame-src': ['authentication-devices'],
    'img-src': ['risk'],
};

const DOMAINS = ['checkout.com', 'sandbox.checkout.com'];

/** @returns The Checkout.com hosts per directive, production and sandbox */
export function getCheckoutcomCspContribution(): CspContribution {
    const contribution: CspContribution = {};

    Object.entries(HOSTS).forEach(([directive, hosts]) => {
        contribution[directive as keyof typeof HOSTS] = DOMAINS.flatMap((domain) =>
            hosts.map((host) => `https://${host}.${domain}`)
        );
    });

    return contribution;
}

export function createCheckoutcomCspContributor(): CspContributor {
    return {
        id: 'checkoutcom-flow',
        isActive: () => true,
        contribute: getCheckoutcomCspContribution,
    };
}
