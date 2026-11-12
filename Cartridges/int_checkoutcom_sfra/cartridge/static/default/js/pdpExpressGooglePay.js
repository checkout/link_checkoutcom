"use strict";

function launchGooglePay() {

    jQuery(".google-pay-button").click(function () {

        var csrfToken = $('input[name="csrf_token"]').val();

        // Create basket for PDP
        $.ajax({
            url: document.getElementById("ckoCreateBasketForPDP").value,
            data: {
                pid: jQuery('[id="ckoProductID"]').val(),
                csrf_token: csrfToken
            },
            method: "POST",
            success: function (e) {
                console.log(e);
            },
            error: function (e) {
                console.log(e);
            }
        });

        const apiConfig = {
            apiVersion: 2,
            apiVersionMinor: 0
        };

        const allowedCardNetworks = ["AMEX", "DISCOVER", "JCB", "MASTERCARD", "VISA"];
        const allowedAuthMethods = ["PAN_ONLY", "CRYPTOGRAM_3DS"];

        const tokenizationSpec = {
            type: "PAYMENT_GATEWAY",
            parameters: {
                gateway: "checkoutltd",
                gatewayMerchantId: jQuery('[id="ckoGatewayMerchantId"]').val()
            }
        };

        const cardPaymentMethod = {
            type: "CARD",
            parameters: {
                allowedAuthMethods: allowedAuthMethods,
                allowedCardNetworks: allowedCardNetworks
            }
        };

        const tokenizedCardPaymentMethod = {
            type: "TOKENIZED_CARD",
            parameters: {
                allowedAuthMethods: allowedAuthMethods,
                allowedCardNetworks: allowedCardNetworks
            }
        };

        const paymentMethod = Object.assign({}, cardPaymentMethod, {
            tokenizationSpecification: tokenizationSpec
        });

        const tokenizedPaymentMethod = Object.assign({}, tokenizedCardPaymentMethod, {
            tokenizationSpecification: tokenizationSpec
        });

        let discounts, productDiscountTotal;
        let paymentsClient = null;

        let shipMethods, shipCosts, salesTax, defaultShippingMethod, discountMap = [];

        // Fetch shipping + tax data
        $.ajax({
            url: document.getElementById("ckoGetShippingMethods").value,
            method: "POST",
            data: { csrf_token: csrfToken },
            success: function (e) {
                shipMethods = e.shipMethods;
                shipCosts = e.shipCosts;
                salesTax = e.salesTax;
                discounts = e.discounts;
                productDiscountTotal = e.productDiscountTotal;
            },
            error: function (e) {
                console.log(e);
            }
        });

        // Check if ready to pay
        getClient().isReadyToPay(Object.assign({}, apiConfig, {
            allowedPaymentMethods: [paymentMethod, tokenizedPaymentMethod]
        }))
        .then(function (e) {
            if (e.result) {
                (function () {
                    var req = buildRequest();
                    req.transactionInfo = {
                        totalPriceStatus: "NOT_CURRENTLY_KNOWN",
                        currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val()
                    };
                    getClient().prefetchPaymentData(req);
                })();
            }
        })
        .catch(function (e) {
            console.log(e);
        });

        var paymentDataRequest = buildRequest();

        function getClient() {
            if (paymentsClient === null) {
                paymentsClient = new google.payments.api.PaymentsClient({
                    environment: "TEST",
                    merchantInfo: {
                        merchantName: "Example Merchant",
                        merchantId: jQuery('[id="ckoGooglePayMerchantId"]').val()
                    },
                    paymentDataCallbacks: {
                        onPaymentAuthorized: onPaymentAuthorized,
                        onPaymentDataChanged: onPaymentDataChanged
                    }
                });
            }
            return paymentsClient;
        }

        function buildRequest() {
            const req = Object.assign({}, apiConfig);

            req.allowedPaymentMethods = [paymentMethod];
            req.transactionInfo = buildTransactionInfo();
            req.merchantInfo = { merchantName: "Example Merchant" };
            req.emailRequired = true;

            req.callbackIntents = [
                "SHIPPING_ADDRESS",
                "SHIPPING_OPTION",
                "PAYMENT_AUTHORIZATION"
            ];

            req.shippingAddressRequired = true;
            req.shippingAddressParameters = { phoneNumberRequired: true };
            req.shippingOptionRequired = true;

            return req;
        }

        function buildTransactionInfo(selectedShipping) {

            var subtotal;
            var isGrossPricing = $('#isGrossPricing').val() === 'true';

            if (productDiscountTotal) {
                subtotal =
                    parseFloat(jQuery('[id="ckoProductPrice"]').val()) +
                    productDiscountTotal;
            } else {
                subtotal = jQuery('[id="ckoProductPrice"]').val();
            }

            if (selectedShipping) {
                var tax = salesTax[selectedShipping];
                var discount = "-" + discounts[selectedShipping];
            }

            var displayItems = [];
            displayItems.push({label: "Subtotal", type: "SUBTOTAL", price: subtotal.toString()});        
            if (!isGrossPricing) {
                displayItems.push({label: "Tax", type: "TAX", price: tax || "0.00"});
            }

            var transaction = {
                displayItems: displayItems,
                currencyCode: jQuery('[id="ckoGooglePayCurrency"]').val(),
                totalPriceStatus: "FINAL",
                totalPrice: jQuery('[id="ckoProductPrice"]').val(),
                totalPriceLabel: "Total"
            };

            if (selectedShipping && parseFloat(discounts[selectedShipping]) > 0) {
                transaction.displayItems.push({
                    label: "Discounts",
                    type: "DISCOUNT",
                    price: discount || "0.00"
                });
            }

            return transaction;
        }

        function onPaymentAuthorized(paymentData) {
            return new Promise(function (resolve) {

                (function (paymentData) {

                    return new Promise(function (resolveInner) {

                        setTimeout(function () {

                            var tokenObj = JSON.parse(
                                paymentData.paymentMethodData.tokenizationData.token
                            );

                            var token = {
                                signature: tokenObj.signature,
                                protocolVersion: tokenObj.protocolVersion,
                                signedMessage: tokenObj.signedMessage
                            };

                            var shippingAddress = paymentData.shippingAddress;
                            var shippingMethod = paymentData.shippingOptionData;

                            jQuery("#ckoGooglePayData").val(JSON.stringify(token));

                            var payload = {
                                ckoGooglePayData: JSON.stringify(token),
                                shippingAddress: JSON.stringify(shippingAddress),
                                shippingMethod: JSON.stringify(shippingMethod),
                                email: paymentData.email,
                                csrf_token: csrfToken
                            };

                            if (
                                $('input[name="dwfrm_billing_googlePayForm_ckoGooglePayData"]').val() === ""
                            ) {
                                $("#google-pay-content .invalid-field-message")
                                    .text(window.ckoLang.googlePayDataInvalid);
                            } else {
                                $.ajax({
                                    url: document.getElementById("ckoGooglePayExpressCheckout").value,
                                    data: payload,
                                    method: "POST",
                                    success: function (e) {
                                        if (e.error) {
                                            var url = location.href;
                                            var hasError = new URL(url).searchParams.has("hasError");

                                            sessionStorage.setItem("reloading", "true");

                                            location.href = hasError
                                                ? location.href
                                                : location.href + "&hasError=true";

                                        } else if (e.redirectUrl) {
                                            location.href = e.redirectUrl;
                                        } else {
                                            document.getElementsByClassName("page")[0].innerHTML = e;
                                        }
                                    },
                                    error: function (e) {
                                        console.log(e);
                                    }
                                });
                            }

                            resolveInner({});
                        }, 3000);

                    });

                })(paymentData)
                .then(function () {
                    resolve({ transactionState: "SUCCESS" });
                })
                .catch(function () {
                    resolve({
                        transactionState: "ERROR",
                        error: {
                            intent: "PAYMENT_AUTHORIZATION",
                            message: "Insufficient funds",
                            reason: "PAYMENT_DATA_INVALID"
                        }
                    });
                });

            });
        }

        function onPaymentDataChanged(e) {

            return new Promise(function (resolve) {

                let shippingAddress = e.shippingAddress;
                let shippingOption = e.shippingOptionData;

                let response = {};

                var addressPayload = {
                    firstName: "",
                    lastName: "",
                    address1: "",
                    address2: "",
                    stateCode: shippingAddress.administrativeArea,
                    city: shippingAddress.locality,
                    postalCode: shippingAddress.postalCode,
                    countryCode: shippingAddress.countryCode,
                    phone: ""
                };

                var requestData = {
                    address: JSON.stringify(addressPayload),
                    csrf_token: csrfToken
                };

                $.ajax({
                    type: "POST",
                    async: false,
                    data: requestData,
                    url: document.getElementById("ckoGetShippingMethods").value,
                    success: function (e) {
                        shipCosts = e.shipCosts;
                        shipMethods = e.shipMethods;
                        salesTax = e.salesTax;
                        discounts = e.discounts;

                        var exists = false;
                        defaultShippingMethod = e.defaultShippingMethod;

                        if (defaultShippingMethod in shipCosts) {
                            exists = true;
                        }

                        if (!exists) {
                            defaultShippingMethod = Object.keys(shipCosts)[0];
                        }
                    },
                    error: function (e) {
                        console.log(e);
                    }
                });

                if (
                    e.callbackTrigger === "INITIALIZE" ||
                    e.callbackTrigger === "SHIPPING_ADDRESS"
                ) {

                    if (shippingAddress.administrativeArea === "NJ") {
                        response.error = {
                            reason: "SHIPPING_ADDRESS_UNSERVICEABLE",
                            message: "Cannot ship to the selected address",
                            intent: "SHIPPING_ADDRESS"
                        };
                    } else {
                        response.newShippingOptionParameters = {
                            defaultSelectedOptionId: defaultShippingMethod,
                            shippingOptions: shipMethods
                        };

                        let selected = response.newShippingOptionParameters.defaultSelectedOptionId;
                        response.newTransactionInfo = updateTransaction(selected);
                    }

                } else if (e.callbackTrigger === "SHIPPING_OPTION") {
                    response.newTransactionInfo = updateTransaction(shippingOption.id);
                }

                resolve(response);
            });
        }

        function updateTransaction(shippingId) {

            let transaction = buildTransactionInfo(shippingId);
            let shippingCost = shipCosts[shippingId];

            transaction.displayItems.push({
                type: "LINE_ITEM",
                label: "Shipping cost",
                price: shippingCost,
                status: "FINAL"
            });

            let total = 0;

            transaction.displayItems.forEach(function (item) {
                total += parseFloat(item.price);
            });

            transaction.totalPrice = total.toFixed(2).toString();

            return transaction;
        }

        paymentDataRequest.transactionInfo = buildTransactionInfo();
        paymentsClient = getClient();

        paymentsClient.loadPaymentData(paymentDataRequest)
            .then(function () {})
            .catch(function (e) {
                location.reload();
                console.log(e);
            });

    });

}

document.addEventListener(
    "DOMContentLoaded",
    function () {

        launchGooglePay();

        $(document).ready(function () {

            if (sessionStorage.getItem("reloading")) {

                sessionStorage.removeItem("reloading");

                if (new URL(location.href).searchParams.get("hasError")) {

                    jQuery(".pdp-googlepay-error").show("fast", function () {
                        setTimeout(function () {
                            jQuery(".pdp-googlepay-error").hide("fast");
                        }, 7000);
                    });

                }
            }

        });

    },
    false
);
