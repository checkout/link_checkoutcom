const request = require('request-promise');
const { assert, expect } = require('chai');
const config = require('../config');
const Url = config.sgUrl;

describe('CKO COPlaceOrder Controller Test', function() {
    this.timeout(25000);
    beforeEach(function() {
        // ...some logic before each test is run
    });
    var options = {
        method: '',
        uri: '',
        json: true,
        headers: {
            'User-Agent': 'Request-Promise'
        }
    };
    context('CKO COPlaceOrder Start', function() {
        const path = "COPlaceOrder-Start";
        it('COPlaceOrder-Start should return a string', function() {
            options.uri = Url + path;
            options.method = 'POST';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.a('string');
                });
        });

    });
});
