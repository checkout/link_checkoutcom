const {assert, expect} = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO Order Controller Tests', () => {
    context('Order Confirm', () => {
        const Path = "Order-Confirm";
        it('Should return a null', () => {
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data, null, 'Should return a null');
                });
        });
    });
});