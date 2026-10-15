'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = require('../../Cartridges/int_checkoutcom_sfra/cartridge/config/constants');

describe('eventsHelper paymentCaptured - AlipayCN branch', function () {
    var OrderMgrStub;
    var OrderStub;
    var PaymentTransactionStub;
    var PaymentMgrStub;
    var ckoHelperStub;
    var transactionHelperStub;
    var savedCardHelperStub;
    var eventsHelper;

    /**
     * Builds a fake dw.order.Order with a single AlipayCN payment instrument.
     * Like AlipayHK, the shared Alipay+ branch checks paymentStatus up front (before
     * calling addWebhookInfo) and also sets ckoActionId/ckoTransactionOpened/
     * ckoTransactionType and confirms the order - so the fake needs to mirror
     * dw.order.Order's instance-constant access pattern for both status fields.
     * @param {Object} opts overrides
     * @returns {Object} fake order
     */
    function createFakeAlipayCnOrder(opts) {
        opts = opts || {};

        var alipayCnInstrument = {
            paymentTransaction: {
                setType: sinon.stub(),
                custom: {},
            },
        };

        var order = {
            paymentStatus: opts.paymentStatus,
            PAYMENT_STATUS_PAID: 'PAID',
            CONFIRMATION_STATUS_CONFIRMED: 'CONFIRMED',
            addNote: sinon.stub(),
            setPaymentStatus: sinon.stub().callsFake(function (status) { order.paymentStatus = status; }),
            setConfirmationStatus: sinon.stub(),
            getPaymentInstruments: sinon.stub().returns({
                toArray: function () { return opts.noInstrument ? [] : [alipayCnInstrument]; },
            }),
        };

        return { order: order, alipayCnInstrument: alipayCnInstrument };
    }

    function buildHook(overrides) {
        return Object.assign({
            type: 'payment_captured',
            id: 'evt_1',
            data: {
                id: 'pay_123',
                reference: 'ORDER-001',
                action_id: 'act_1',
                response_code: '10000',
                metadata: { payment_processor: 'CHECKOUTCOM_ALIPAYCN' },
            },
        }, overrides);
    }

    beforeEach(function () {
        ckoHelperStub = {
            _: sinon.stub().callsFake(function (key) { return key; }),
        };

        transactionHelperStub = {
            getHookTransactionAmount: sinon.stub(),
            getParentTransaction: sinon.stub(),
            shouldCloseRefund: sinon.stub(),
        };

        savedCardHelperStub = {
            updateSavedCard: sinon.stub(),
        };

        PaymentTransactionStub = { TYPE_CAPTURE: 'CAPTURE_TYPE' };
        PaymentMgrStub = { getPaymentMethod: sinon.stub() };
        OrderStub = { PAYMENT_STATUS_PAID: 'PAID' };
        OrderMgrStub = { getOrder: sinon.stub() };

        eventsHelper = proxyquire('../../Cartridges/int_checkoutcom_sfra/cartridge/scripts/helpers/eventsHelper', {
            'dw/order/OrderMgr': OrderMgrStub,
            'dw/order/Order': OrderStub,
            'dw/system/Transaction': { wrap: function (cb) { cb(); } },
            'dw/order/PaymentTransaction': PaymentTransactionStub,
            'dw/order/PaymentMgr': PaymentMgrStub,
            '*/cartridge/scripts/helpers/ckoHelper': ckoHelperStub,
            '*/cartridge/scripts/helpers/savedCardHelper': savedCardHelperStub,
            '*/cartridge/scripts/helpers/transactionHelper': transactionHelperStub,
            '*/cartridge/config/constants': constants,
        });
    });

    it('sets the existing AlipayCN payment instrument to CAPTURE and confirms the order when not already paid', function () {
        var fake = createFakeAlipayCnOrder({ paymentStatus: 'NOTPAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isTrue(fake.alipayCnInstrument.paymentTransaction.setType.calledWith('CAPTURE_TYPE'));
        assert.equal(fake.alipayCnInstrument.paymentTransaction.custom.ckoActionId, 'act_1');
        assert.isTrue(fake.alipayCnInstrument.paymentTransaction.custom.ckoTransactionOpened);
        assert.equal(fake.alipayCnInstrument.paymentTransaction.custom.ckoTransactionType, 'Capture');
        assert.isTrue(fake.order.setConfirmationStatus.calledWith('CONFIRMED'));
    });

    it('looks up the payment instrument using the AlipayCN processor id, not AlipayHK', function () {
        var fake = createFakeAlipayCnOrder({ paymentStatus: 'NOTPAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isTrue(fake.order.getPaymentInstruments.calledWith(constants.CKO_ALIPAYCN_PAYMENTINSTRUMENT));
    });

    it('marks the order as PAID via addWebhookInfo for the AlipayCN early-return path', function () {
        var fake = createFakeAlipayCnOrder({ paymentStatus: 'NOTPAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isTrue(fake.order.setPaymentStatus.calledWith('PAID'));
    });

    it('does not mutate the instrument or confirm the order when it was already PAID', function () {
        var fake = createFakeAlipayCnOrder({ paymentStatus: 'PAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isFalse(fake.alipayCnInstrument.paymentTransaction.setType.called);
        assert.isFalse(fake.order.setConfirmationStatus.called);
    });

    it('does not attempt to mutate an instrument when the order has no AlipayCN payment instrument', function () {
        var fake = createFakeAlipayCnOrder({ paymentStatus: 'NOTPAID', noInstrument: true });
        OrderMgrStub.getOrder.returns(fake.order);

        assert.doesNotThrow(function () {
            eventsHelper.paymentCaptured(buildHook());
        });
        assert.isFalse(fake.alipayCnInstrument.paymentTransaction.setType.called);
        assert.isFalse(fake.order.setConfirmationStatus.called);
    });
});
