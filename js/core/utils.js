export function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w-]+/g, '') // Remove all non-word chars
        .replace(/-{2,}/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text
}
/**
 * Trims character extensions, for example the parantheses part in `JOE (on the radio)`
 */
export const trimCharacterExtension = (character) => character.replace(/[ \t]*(\(.*\))[ \t]*([ \t]*\^)?$/, "");
export const parseLocationInformation = (scene_heading) => {
    //input group 1 is int/ext, group 2 is location and time, group 3 is scene number
    let splitLocationFromTime = scene_heading[2].match(/(.*)[-–—−](.*)/);
    if (scene_heading != null && scene_heading.length >= 3) {
        return {
            name: splitLocationFromTime ? splitLocationFromTime[1].trim() : scene_heading[2].trim(),
            interior: scene_heading[1].indexOf('I') != -1,
            exterior: scene_heading[1].indexOf('EX') != -1 || scene_heading[1].indexOf('E.') != -1,
            time_of_day: splitLocationFromTime ? splitLocationFromTime[2].trim() : ""
        };
    }
    return null;
};
/**
 * Trims the `@` symbol necessary in character names if they contain lower-case letters, i.e. `@McCONNOR`
 */
export const trimCharacterForceSymbol = (character) => character.replace(/^[ \t]*@/, "");
/**
 * Character names containing lowercase letters need to be prefixed with an `@` symbol
 */
export const addForceSymbolToCharacter = (characterName) => {
    const containsLowerCase = (text) => ((/[\p{Ll}]/u).test(text));
    return containsLowerCase(characterName) ? `@${characterName}` : characterName;
};
export const calculateDialogueDuration = (dialogue) => {
    var duration = 0;
    //According to this paper: http://www.office.usp.ac.jp/~klinger.w/2010-An-Analysis-of-Articulation-Rates-in-Movies.pdf
    //The average amount of syllables per second in the 14 movies analysed is 5.13994 (0.1945548s/syllable)
    var sanitized = dialogue.replace(/[^\w]/gi, '');
    duration += ((sanitized.length) / 3) * 0.1945548;
    //duration += syllable(dialogue)*0.1945548;
    //According to a very crude analysis involving watching random movie scenes on youtube and measuring pauses with a stopwatch
    //A comma in the middle of a sentence adds 0.4sec and a full stop/excalmation/question mark adds 0.8 sec.
    var punctuationMatches = dialogue.match(/(\.|\?|\!|\:) |(\, )/g);
    if (punctuationMatches) {
        if (punctuationMatches[0])
            duration += 0.75 * punctuationMatches[0].length;
        if (punctuationMatches[1])
            duration += 0.3 * punctuationMatches[1].length;
    }
    return duration;
};
export const isMonologue = (seconds) => {
    if (seconds > 30)
        return true;
    else
        return false;
};
function padZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}
export function secondsToString(seconds) {
    var time = new Date(null);
    time.setHours(0);
    time.setMinutes(0);
    time.setSeconds(seconds);
    return padZero(time.getHours()) + ":" + padZero(time.getMinutes()) + ":" + padZero(time.getSeconds());
}
export function secondsToMinutesString(seconds) {
    if (seconds < 1)
        return undefined;
    var time = new Date(null);
    time.setHours(0);
    time.setMinutes(0);
    time.setSeconds(seconds);
    if (seconds >= 3600)
        return padZero(time.getHours()) + ":" + padZero(time.getMinutes()) + ":" + padZero(time.getSeconds());
    else
        return padZero(time.getHours() * 60 + time.getMinutes()) + ":" + padZero(time.getSeconds());
}
export const last = function (array) {
    return array[array.length - 1];
};
//Simple n-bit hash
function nPearsonHash(message, n = 8) {
    // Ideally, this table would be shuffled...
    // 256 will be the highest value provided by this hashing function
    var table = [...new Array(2 ** n)].map((_, i) => i);
    return message.split('').reduce((hash, c) => {
        return table[(hash + c.charCodeAt(0)) % (table.length - 1)];
    }, message.length % (table.length - 1));
}
function HSVToRGB(h, s, v) {
    var [r, g, b] = [0, 0, 0];
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            r = v, g = t, b = p;
            break;
        case 1:
            r = q, g = v, b = p;
            break;
        case 2:
            r = p, g = v, b = t;
            break;
        case 3:
            r = p, g = q, b = v;
            break;
        case 4:
            r = t, g = p, b = v;
            break;
        case 5:
            r = v, g = p, b = q;
            break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
//We are using colors with same value and saturation as highlighters
export function wordToColor(word, s = 0.5, v = 1) {
    const n = 5; //so that colors are spread apart
    const h = nPearsonHash(word, n) / 2 ** (8 - n);
    return HSVToRGB(h, s, v);
}
export function mapToObject(map) {
    let jsonObject = {};
    map.forEach((value, key) => {
        jsonObject[key] = value;
    });
    return jsonObject;
}
function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}
export function rgbToHex(rgb) {
    return "#" + componentToHex(rgb[0]) + componentToHex(rgb[1]) + componentToHex(rgb[2]);
}
export function median(values) {
    if (values.length == 0)
        return 0;
    values.sort(function (a, b) { return a - b; });
    var half = Math.floor(values.length / 2);
    if (values.length % 2)
        return values[half];
    else
        return (values[half - 1] + values[half]) / 2.0;
}
