const {assert, expect} = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO COPlaceOrder Controller Tests', () => {
    context('COPlaceOrder Submit', () => {
        const Path = "COPlaceOrder-Submit";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});