!function(){"use strict";var a={5812:function(a){var t;function r(a){$(".pdp-paypal-error").remove();var t='<div class="pdp-paypal-error collapse"><div class="alert alert-danger alert-dismissible valid-cart-error fade show" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>'+(a||"Payment via PayPal is unavailable at this time; please try again later or select a different payment method")+"</div></div>";$("#maincontent").prepend(t),$(".pdp-paypal-error").show("fast",(function(){setTimeout((function(){jQuery(".pdp-paypal-error").hide("fast")}),7e3)})),$("html, body").animate({scrollTop:$(".pdp-paypal-error").offset().top},200)}function e(){var a;return $.ajax({type:"POST",url:$("#payPalCreateOrderUrl").val(),async:!1,data:{getFromFile:"get_from_file"},success:function(t){a=t,t&&!t.error||r(t&&t.message)},error:function(a){console.log(a),r()}}),a}function o(a){$.spinner().start(),$.ajax({type:"POST",url:$("#ckoPayPalExpressCheckout").val(),dataType:"text",data:{paymentContextId:a},success:function(a){if(a.error)r(a.message);else if(a.redirectUrl)location.href=a.redirectUrl;else{var t=JSON.parse(a),e=$("<form>").appendTo(document.body).attr({method:"POST",action:t.continueUrl});$("<input>").appendTo(e).attr({name:"orderID",value:t.orderID}),$("<input>").appendTo(e).attr({name:"orderToken",value:t.orderToken}),e.submit()}$.spinner().stop()},error:function(a){console.log(a),r(),$.spinner().stop()}})}$("#paypal-button-container-cart").length>0&&paypal_sdk&&"false"!==$("#paypal-button-container-cart").attr("data-show-paypal")&&($("#paypal-button-container-cart").attr("data-show-paypal","false"),paypal_sdk.Buttons({createOrder:function(){var a=e();return t=a?a.id:"",a.partner_metadata.order_id},onApprove:function(){o(t)},style:$(".paypal-dynamic-button-block").attr("data-paypal-button-config")?JSON.parse($(".paypal-dynamic-button-block").attr("data-paypal-button-config")).cart:""}).render("#paypal-button-container-cart")),a.exports={createPayPalOrder:e,onApprovePayPalOrder:o,showError:r}}},t={};!function r(e){var o=t[e];if(void 0!==o)return o.exports;var n=t[e]={exports:{}};return a[e](n,n.exports,r),n.exports}(5812)}();