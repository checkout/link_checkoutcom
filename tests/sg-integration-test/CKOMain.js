const request = require('request-promise');
const { assert, expect } = require('chai');
const config = require('../config');
const Url = config.sgUrl;

describe('CKO Main Controller Test', function() {
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
    context('CKO Main HandleRequest', function() {
        const path = "CKOMain-HandleReturn";
        it('CKOMain-HandleReturn should return a string that includes: Order Not Found', function() {
            options.uri = Url + path;
            options.method = 'GET';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.a('string').that.include('Order Not Found');
                });
        });
    });
    context('CKO Main HandleFail', function() {
        const path = "CKOMain-HandleFail";
        it('CKOMain-HandleFail should return a string that includes: Order Failed', function() {
            options.uri = Url + path;
            options.method = 'GET';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.a('string').that.include('Order Failed');
                });
        });
    });
    context('CKO Main HandleWebhook', function() {
        const path = "CKOMain-HandleWebhook";
        it('CKOMain-HandleWebhook should return a string that includes: Invalid Response', function() {
            options.uri = Url + path;
            options.method = 'POST';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.a('string').that.include('Invalid Response');
                });
        });
    });
    context('CKO Main GetCardsList', function() {
        const path = "CKOMain-GetCardsList";
        it('CKOMain-GetCardsList should return a string that includes: Failed Authentication', function() {
            options.uri = Url + path;
            options.method = 'POST';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.a('string').that.include('Failed Authentication');
                });
        });
    });
    context('CKO Main GetApmFilter', function() {
        const path = "CKOMain-GetApmFilter";
        it('CKOMain-GetApmFilter should return a string that includes: Shipping Address Not Found', function() {
            options.uri = Url + path;
            options.method = 'GET';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.a('string').that.include('Basket Not Found');
                });
        });
    });
    context('CKO Main GetMadaBin', function() {
        const path = "CKOMain-GetMadaBin";
        it('CKOMain-GetMadaBin should return an object', function() {
            options.uri = Url + path;
            options.method = 'GET';
            return request(options)
                .then(function (response) {
                    expect(response).to.be.an('object');
                });
        });
    });
});
