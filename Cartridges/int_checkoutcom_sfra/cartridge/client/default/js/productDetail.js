'use strict';

var processInclude = require('base/util');

$(document).ready(function() {
    // your code to be executed after 1 second
    if ($('.add-to-cart').is(':disabled')) {
        $('.btn1').hide();
    } else {
        $('.btn1').show();
    }
    processInclude(require('./product/detail'));
});

