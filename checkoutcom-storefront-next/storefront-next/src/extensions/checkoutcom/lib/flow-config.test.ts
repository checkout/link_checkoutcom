/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */
import { describe, it, expect, vi } from 'vitest';
import { buildFlowOptions, mergeDeep, sanitizeComponentOptions, type FlowConfigInput } from './flow-config';

function input(overrides: Partial<FlowConfigInput> = {}): FlowConfigInput {
    return {
        session: { publicKey: 'pk_test', environment: 'sandbox', paymentSession: { id: 'ps_1' } },
        theme: {},
        locale: 'en-US',
        context: { basket: undefined, locale: 'en-US' },
        own: { handleSubmit: vi.fn(), onPaymentCompleted: vi.fn(), onError: vi.fn() },
        ...overrides,
    };
}

describe('buildFlowOptions', () => {
    it('applies the theme, then the Business Manager appearance on top', () => {
        const options = buildFlowOptions(
            input({
                theme: { colorAction: '#111111', colorBorder: '#222222', label: { fontFamily: 'Sen' } },
                session: {
                    ...input().session,
                    appearance: { colorAction: '#FF0000', label: { fontSize: '14px' } },
                },
            })
        );

        expect(options.appearance).toEqual({
            colorAction: '#FF0000',
            colorBorder: '#222222',
            label: { fontFamily: 'Sen', fontSize: '14px' },
        });
    });

    it('passes the component options and translations from Business Manager', () => {
        const options = buildFlowOptions(
            input({
                session: {
                    ...input().session,
                    componentOptions: { card: { displayCardholderName: 'top' } },
                    translations: { 'en-US': { 'pay_button.pay': 'Pay now' } },
                },
            })
        );

        expect(options.componentOptions).toEqual({ card: { displayCardholderName: 'top' } });
        expect(options.translations).toEqual({ 'en-US': { 'pay_button.pay': 'Pay now' } });
    });

    it('lets flow-options.ts change options, but never the locked ones', () => {
        const own = input().own;
        const options = buildFlowOptions(
            input({
                own,
                customize: (current) =>
                    ({
                        ...current,
                        locale: 'fr-FR',
                        publicKey: 'pk_other',
                        paymentSession: { id: 'ps_other' },
                        handleSubmit: vi.fn(),
                        componentOptions: {
                            amount: 1,
                            currency: 'EUR',
                            items: [],
                            flow: { showPayButton: true, expandFirstPaymentMethod: false },
                        },
                    }) as never,
            })
        );

        expect(options.locale).toBe('fr-FR');
        expect(options.publicKey).toBe('pk_test');
        expect(options.paymentSession).toEqual({ id: 'ps_1' });
        expect(options.handleSubmit).toBe(own.handleSubmit);
        expect(options.componentOptions).toEqual({ flow: { expandFirstPaymentMethod: false } });
    });

    it('runs the integration callback first, then the merchant one, whose failure is ignored', async () => {
        const calls: string[] = [];
        const options = buildFlowOptions(
            input({
                own: { handleSubmit: vi.fn(), onError: () => void calls.push('own'), onPaymentCompleted: vi.fn() },
                customize: (current) => ({
                    ...current,
                    onError: () => {
                        calls.push('merchant');
                        throw new Error('boom');
                    },
                }),
            })
        );

        await options.onError?.({} as never, {});
        expect(calls).toEqual(['own', 'merchant']);
    });

    it('ignores a flow-options.ts that throws', () => {
        const options = buildFlowOptions(
            input({
                theme: { colorAction: '#111111' },
                customize: () => {
                    throw new Error('broken customisation');
                },
            })
        );

        expect(options.appearance).toEqual({ colorAction: '#111111' });
        expect(options.publicKey).toBe('pk_test');
    });

    it('leaves out empty options', () => {
        const options = buildFlowOptions(input());

        expect('appearance' in options).toBe(false);
        expect('componentOptions' in options).toBe(false);
        expect('translations' in options).toBe(false);
    });
});

describe('helpers', () => {
    it('mergeDeep replaces arrays instead of merging them', () => {
        expect(mergeDeep({ borderRadius: ['4px', '4px'] }, { borderRadius: ['8px', '8px'] })).toEqual({
            borderRadius: ['8px', '8px'],
        });
    });

    it('sanitizeComponentOptions keeps per method options', () => {
        expect(sanitizeComponentOptions({ googlepay: { buttonColor: 'white' }, items: [] })).toEqual({
            googlepay: { buttonColor: 'white' },
        });
    });
});
