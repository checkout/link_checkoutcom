/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */
import { describe, it, expect } from 'vitest';
import { validateContributors } from '@salesforce/storefront-next-runtime/security';
import { createCheckoutcomCspContributor, getCheckoutcomCspContribution } from './csp-contributor';

describe('Checkout.com CSP contributor', () => {
    it('contributes the exact production and sandbox hosts', () => {
        const contribution = getCheckoutcomCspContribution();

        expect(contribution['script-src']).toEqual([
            'https://checkout-web-components.checkout.com',
            'https://risk.checkout.com',
            'https://checkout-web-components.sandbox.checkout.com',
            'https://risk.sandbox.checkout.com',
        ]);
        expect(contribution['connect-src']).toContain('https://devices.api.checkout.com');
        expect(contribution['connect-src']).toContain('https://checkout-web-components-events.sandbox.checkout.com');
        expect(contribution['frame-src']).toEqual([
            'https://authentication-devices.checkout.com',
            'https://authentication-devices.sandbox.checkout.com',
        ]);
        expect(contribution['img-src']).toEqual(['https://risk.checkout.com', 'https://risk.sandbox.checkout.com']);
        expect(JSON.stringify(contribution)).not.toContain('*');
    });

    it('passes the runtime contributor validation (https only, no wildcards)', () => {
        expect(() => validateContributors([createCheckoutcomCspContributor()])).not.toThrow();
    });
});
