'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = require('../../Cartridges/int_checkoutcom_sfra/cartridge/config/constants');

describe('eventsHelper paymentCaptured - Tamara branch', function () {
    var OrderMgrStub;
    var OrderStub;
    var PaymentTransactionStub;
    var PaymentMgrStub;
    var ckoHelperStub;
    var transactionHelperStub;
    var savedCardHelperStub;
    var eventsHelper;

    /**
     * Builds a fake dw.order.Order with a single Tamara payment instrument.
     * @param {Object} opts overrides
     * @returns {Object} fake order
     */
    function createFakeTamaraOrder(opts) {
        opts = opts || {};

        var tamaraInstrument = {
            paymentTransaction: {
                setType: sinon.stub(),
                custom: {},
            },
        };

        var order = {
            paymentStatus: opts.paymentStatus,
            PAYMENT_STATUS_PAID: 'PAID',
            addNote: sinon.stub(),
            setPaymentStatus: sinon.stub().callsFake(function (status) { order.paymentStatus = status; }),
            setConfirmationStatus: sinon.stub(),
            getPaymentInstruments: sinon.stub().returns({
                toArray: function () { return opts.noInstrument ? [] : [tamaraInstrument]; },
            }),
        };

        return { order: order, tamaraInstrument: tamaraInstrument };
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
                metadata: { payment_processor: 'CHECKOUTCOM_TAMARA' },
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

    it('sets the existing Tamara payment instrument to CAPTURE instead of creating a new one', function () {
        var fake = createFakeTamaraOrder({ paymentStatus: 'NOTPAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isTrue(fake.tamaraInstrument.paymentTransaction.setType.calledWith('CAPTURE_TYPE'));
        assert.equal(fake.tamaraInstrument.paymentTransaction.custom.ckoActionId, 'act_1');
        assert.isTrue(fake.tamaraInstrument.paymentTransaction.custom.ckoTransactionOpened);
        assert.equal(fake.tamaraInstrument.paymentTransaction.custom.ckoTransactionType, 'Capture');
    });

    it('marks the order as PAID via addWebhookInfo for the Tamara early-return path', function () {
        var fake = createFakeTamaraOrder({ paymentStatus: 'NOTPAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isTrue(fake.order.setPaymentStatus.calledWith('PAID'));
    });

    it('does not touch the payment status again if the order was already PAID (onlyIfNotPaid gate)', function () {
        var fake = createFakeTamaraOrder({ paymentStatus: 'PAID' });
        OrderMgrStub.getOrder.returns(fake.order);

        eventsHelper.paymentCaptured(buildHook());

        assert.isFalse(fake.order.setPaymentStatus.called);
    });

    it('does not attempt to mutate an instrument when the order has no Tamara payment instrument', function () {
        var fake = createFakeTamaraOrder({ paymentStatus: 'NOTPAID', noInstrument: true });
        OrderMgrStub.getOrder.returns(fake.order);

        assert.doesNotThrow(function () {
            eventsHelper.paymentCaptured(buildHook());
        });
        assert.isFalse(fake.tamaraInstrument.paymentTransaction.setType.called);
    });

    it('still creates a new capture payment instrument for the generic (non-Tamara) path', function () {
        var genericInstrument = {
            paymentTransaction: {
                setType: sinon.stub(),
                custom: {},
                transactionID: null,
                paymentProcessor: null,
                // Pre-set as if setType() had already flipped it to CAPTURE, mirroring
                // the real bean-style getter/setter pair the mock doesn't wire together.
                type: { value: 'CAPTURE' },
                amount: { value: 100 },
            },
        };

        var order = {
            PAYMENT_STATUS_PAID: 'PAID',
            CONFIRMATION_STATUS_CONFIRMED: 'CONFIRMED',
            addNote: sinon.stub(),
            setPaymentStatus: sinon.stub(),
            setConfirmationStatus: sinon.stub(),
            getTotalGrossPrice: function () { return { getValue: function () { return 100; } }; },
            getPaymentInstruments: sinon.stub().returns({
                toArray: function () { return [genericInstrument]; },
            }),
            createPaymentInstrument: sinon.stub().returns(genericInstrument),
        };

        OrderMgrStub.getOrder.returns(order);
        PaymentMgrStub.getPaymentMethod.returns({ getPaymentProcessor: sinon.stub().returns('processorRef') });
        transactionHelperStub.getHookTransactionAmount.returns(100);
        transactionHelperStub.getParentTransaction.returns(null);

        var hook = buildHook({
            data: {
                id: 'pay_999',
                reference: 'ORDER-002',
                action_id: 'act_2',
                response_code: '10000',
                metadata: { payment_processor: 'CHECKOUTCOM_CARD' },
            },
        });

        eventsHelper.paymentCaptured(hook);

        assert.isTrue(order.createPaymentInstrument.calledWith('CHECKOUTCOM_CARD', 100));
        assert.isTrue(genericInstrument.paymentTransaction.setType.calledWith('CAPTURE_TYPE'));
        assert.isTrue(order.setConfirmationStatus.calledWith('CONFIRMED'));
    });
});
