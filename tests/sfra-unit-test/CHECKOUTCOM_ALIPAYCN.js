'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = require('../../Cartridges/int_checkoutcom_sfra/cartridge/config/constants');

describe('CHECKOUTCOM_ALIPAYCN processor hook', function () {
    var ckoHelperStub;
    var alipayCnHelperStub;
    var OrderMgrStub;
    var processorHook;

    beforeEach(function () {
        ckoHelperStub = {
            getPaymentFailureMessage: sinon.stub().returns('Payment failed, please try again.'),
        };

        alipayCnHelperStub = {
            handleRequest: sinon.stub(),
        };

        OrderMgrStub = {
            getOrder: sinon.stub(),
        };

        processorHook = proxyquire('../../Cartridges/int_checkoutcom_sfra/cartridge/scripts/hooks/payment/processor/CHECKOUTCOM_ALIPAYCN', {
            'dw/system/Transaction': { wrap: function (cb) { cb(); } },
            'dw/order/OrderMgr': OrderMgrStub,
            '*/cartridge/scripts/helpers/ckoHelper': ckoHelperStub,
            '*/cartridge/scripts/helpers/alipayCnHelper': alipayCnHelperStub,
            '*/cartridge/config/constants': constants,
        });
    });

    describe('Handle', function () {
        it('replaces basket payment instruments with a single AlipayCN instrument', function () {
            var basket = {
                removeAllPaymentInstruments: sinon.stub(),
                createPaymentInstrument: sinon.stub(),
                getTotalGrossPrice: sinon.stub().returns('225.98'),
            };

            var result = processorHook.Handle(basket, {}, 'CHECKOUTCOM_ALIPAYCN', {});

            assert.isTrue(basket.removeAllPaymentInstruments.calledOnce);
            assert.isTrue(basket.createPaymentInstrument.calledWith(constants.CKO_ALIPAYCN_PAYMENTINSTRUMENT, '225.98'));
            assert.deepEqual(result, { fieldErrors: {}, serverErrors: [], error: false });
        });
    });

    describe('Authorize', function () {
        it('sets the transaction ID/processor and returns the redirect URL on success', function () {
            var order = { addNote: sinon.stub() };
            OrderMgrStub.getOrder.returns(order);
            alipayCnHelperStub.handleRequest.returns({
                error: false,
                redirectUrl: 'https://open-sea-global.alipayplus.com/redirect',
                transactionID: 'pay_123',
            });

            var paymentInstrument = {
                paymentTransaction: {
                    setPaymentProcessor: sinon.stub(),
                    setTransactionID: sinon.stub(),
                },
            };

            var result = processorHook.Authorize('ORDER-001', paymentInstrument, 'processorRef');

            assert.isFalse(result.error);
            assert.equal(result.redirectUrl, 'https://open-sea-global.alipayplus.com/redirect');
            assert.isTrue(paymentInstrument.paymentTransaction.setPaymentProcessor.calledWith('processorRef'));
            assert.isTrue(paymentInstrument.paymentTransaction.setTransactionID.calledWith('pay_123'));
            assert.isFalse(order.addNote.called);
        });

        it('records the failure reason and pushes a server error when the gateway request fails', function () {
            var order = { addNote: sinon.stub() };
            OrderMgrStub.getOrder.returns(order);
            alipayCnHelperStub.handleRequest.returns({
                error: true,
                errorMessage: 'AlipayCN service unavailable',
            });

            var paymentInstrument = {
                paymentTransaction: {
                    setPaymentProcessor: sinon.stub(),
                    setTransactionID: sinon.stub(),
                },
            };

            var result = processorHook.Authorize('ORDER-001', paymentInstrument, 'processorRef');

            assert.isTrue(result.error);
            assert.lengthOf(result.serverErrors, 1);
            assert.isTrue(order.addNote.calledWith('AlipayCN Authorization Failed', 'AlipayCN service unavailable'));
            assert.isTrue(paymentInstrument.paymentTransaction.setTransactionID.calledWith(''));
        });
    });
});
