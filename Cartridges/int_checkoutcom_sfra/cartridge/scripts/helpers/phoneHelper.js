'use strict';

/**
 * Phone numbers for Checkout.com requests, as { country_code, number }.
 *
 * B2C Commerce stores a phone as one free-text string. Checkout.com rejects a
 * null country_code, so a code is sent only when it can be told reliably; the
 * same rules as the Storefront Next app (int_checkoutcom_next payload.js).
 */

/**
 * Country calling codes by ISO 3166 country (ITU-T E.164). The codes are prefix
 * free, so a number's code is the longest one it starts with.
 */
var CALLING_CODES = (
    'AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AR54 AS1 AT43 AU61 AW297 AX358 AZ994 BA387 BB1 BD880 BE32 '
    + 'BF226 BG359 BH973 BI257 BJ229 BL590 BM1 BN673 BO591 BQ599 BR55 BS1 BT975 BW267 BY375 BZ501 CA1 CC61 '
    + 'CD243 CF236 CG242 CH41 CI225 CK682 CL56 CM237 CN86 CO57 CR506 CU53 CV238 CW599 CX61 CY357 CZ420 DE49 '
    + 'DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 EH212 ER291 ES34 ET251 FI358 FJ679 FK500 FM691 FO298 FR33 '
    + 'GA241 GB44 GD1 GE995 GF594 GG44 GH233 GI350 GL299 GM220 GN224 GP590 GQ240 GR30 GT502 GU1 GW245 GY592 '
    + 'HK852 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IM44 IN91 IO246 IQ964 IR98 IS354 IT39 JE44 JM1 JO962 '
    + 'JP81 KE254 KG996 KH855 KI686 KM269 KN1 KP850 KR82 KW965 KY1 KZ7 LA856 LB961 LC1 LI423 LK94 LR231 '
    + 'LS266 LT370 LU352 LV371 LY218 MA212 MC377 MD373 ME382 MF590 MG261 MH692 MK389 ML223 MM95 MN976 MO853 '
    + 'MP1 MQ596 MR222 MS1 MT356 MU230 MV960 MW265 MX52 MY60 MZ258 NA264 NC687 NE227 NF672 NG234 NI505 NL31 '
    + 'NO47 NP977 NR674 NU683 NZ64 OM968 PA507 PE51 PF689 PG675 PH63 PK92 PL48 PM508 PR1 PS970 PT351 PW680 '
    + 'PY595 QA974 RE262 RO40 RS381 RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SH290 SI386 SJ47 SK421 SL232 '
    + 'SM378 SN221 SO252 SR597 SS211 ST239 SV503 SX1 SY963 SZ268 TC1 TD235 TG228 TH66 TJ992 TK690 TL670 '
    + 'TM993 TN216 TO676 TR90 TT1 TV688 TW886 TZ255 UA380 UG256 US1 UY598 UZ998 VA39 VC1 VE58 VG1 VI1 VN84 '
    + 'VU678 WF681 WS685 XK383 YE967 YT262 ZA27 ZM260 ZW263'
).split(' ').reduce(function(codes, entry) {
    codes[entry.slice(0, 2)] = entry.slice(2);

    return codes;
}, {});

var KNOWN_CODES = Object.keys(CALLING_CODES).reduce(function(known, country) {
    known[CALLING_CODES[country]] = true;

    return known;
}, {});

/**
 * The national (trunk) prefix dialled before a national number, for the
 * countries whose rule is known: removed before the calling code is added
 * ("030 123456" in DE: +49 30123456; "06 1 234 5678" in HU: +36 12345678). An
 * empty prefix means national numbers are dialled as they are: Italy's leading
 * 0 is part of the number. A national number from any other country is sent
 * as a bare { number }: its prefix rule is not known (in Côte d'Ivoire, for
 * one, the leading 0 is significant), and a wrong guess would corrupt it.
 */
var TRUNK_PREFIXES = {
    AT: '0', AU: '0', BE: '0', CH: '0', CN: '0', DE: '0', FI: '0', FR: '0', GB: '0', IE: '0', IL: '0',
    IN: '0', JP: '0', KR: '0', NL: '0', NZ: '0', SE: '0', TR: '0', UA: '0', ZA: '0',
    HU: '06',
    DK: '', ES: '', GR: '', IT: '', LU: '', NO: '', PL: '', PT: '', SM: '', VA: '',
};

/**
 * @param {string} code Calling code digits
 * @param {string} number National number digits
 * @returns {Object|null} The phone, when the number has a plausible length
 */
function phoneOf(code, number) {
    if (number.length < 6 || number.length > 25) {
        return null;
    }

    return code ? { country_code: '+' + code, number: number } : { number: number };
}

/**
 * A phone as Checkout.com's { country_code, number }. B2C Commerce stores one
 * string, which the storefront template writes as "<code> <number>"
 * ("+49 30123456"). The calling code is taken from the "+" prefix (split at the
 * separator, or by the longest known code), else from the address's country
 * for a national number of a country whose trunk prefix is known
 * (TRUNK_PREFIXES). When the code can't be told, only the number is sent, as
 * Checkout.com rejects a null country_code.
 * @param {string} phone The stored phone
 * @param {string} [countryCode] The address's ISO country code
 * @returns {Object|null} { country_code?, number }, or null without a usable number
 */
function toPhone(phone, countryCode) {
    var raw = String(phone || '').trim();
    var digits = raw.replace(/\D/g, '');

    if (!digits) {
        return null;
    }

    if (raw.charAt(0) === '+' || raw.indexOf('00') === 0) {
        var international = raw.charAt(0) === '+' ? raw.slice(1) : raw.slice(2);
        var separated = /^(\d{1,3})[\s.\-()]+(.*)$/.exec(international);

        if (separated && KNOWN_CODES[separated[1]]) {
            return phoneOf(separated[1], separated[2].replace(/\D/g, '')) || phoneOf(null, digits);
        }

        var all = international.replace(/\D/g, '');

        for (var length = 3; length >= 1; length--) {
            if (KNOWN_CODES[all.slice(0, length)]) {
                return phoneOf(all.slice(0, length), all.slice(length)) || phoneOf(null, digits);
            }
        }

        return phoneOf(null, digits);
    }

    var country = countryCode ? String(countryCode).toUpperCase() : null;
    var code = country ? CALLING_CODES[country] : null;
    var national = digits;

    if (code === '1') {
        // North America: national numbers may be written with their leading 1
        if (national.length === 11 && national.charAt(0) === '1') {
            national = national.slice(1);
        }

        return phoneOf(code, national) || phoneOf(null, digits);
    }

    if (!code || !Object.prototype.hasOwnProperty.call(TRUNK_PREFIXES, country)) {
        return phoneOf(null, digits);
    }

    var trunk = TRUNK_PREFIXES[country];

    if (trunk && national.indexOf(trunk) === 0) {
        national = national.slice(trunk.length);
    }

    return phoneOf(code, national) || phoneOf(null, digits);
}

module.exports = {
    toPhone: toPhone,

    /**
     * @param {dw.order.OrderAddress} address An order address
     * @returns {Object|null} Its phone for Checkout.com, or null when it has none
     */
    fromAddress: function(address) {
        if (!address || !address.getPhone()) {
            return null;
        }

        var country = address.getCountryCode() ? address.getCountryCode().getValue() : null;

        return toPhone(address.getPhone(), country);
    },
};
