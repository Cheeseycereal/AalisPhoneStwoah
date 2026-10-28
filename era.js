// ═══ Era presets ═══
// "Era" is a vibes-and-apps setting that reshapes the phone to a particular slice
// of time. It filters which apps show on the home screen (Instagram did not exist
// in 2003, so it does not appear), biases the AI's texting voice toward the
// abbreviations and emoticons of that period, and suggests a matching phone shell
// skin on first switch. The chosen SKIN (flip / sidekick / bbry / modern themes)
// stays independently editable in Appearance — the era is the setting, the skin
// is the look.
//
// Nothing is deleted when the era changes: hidden apps keep their data and come
// back the moment the era allows them again.

import { getSettings } from './state.js';

// Apps always allowed in every era (settings-adjacent and functional staples)
const ALWAYS_ON = new Set(['appearance', 'notes']);

export const ERAS = {
    modern: {
        id: 'modern',
        name: 'Modern',
        range: 'present day',
        apps: null,          // null = all apps visible
        defaultSkin: null,   // null = do not suggest a shell switch
        textspeak: null,     // null = default texting voice
    },
    'y2k-early': {
        id: 'y2k-early',
        name: 'Early Y2K',
        range: '2000–2004',
        apps: new Set(['list', 'bank', 'shop', 'casino', 'news']),
        defaultSkin: 'flip',
        textspeak: 'early',
    },
    'y2k-mid': {
        id: 'y2k-mid',
        name: 'Mid Y2K',
        range: '2005–2008',
        // ig is on this list because Mid Y2K rebrands it as MySpace (see igLabel below)
        // — same app, same add-a-friend + tap-to-generate flows, period-correct label.
        apps: new Set(['list', 'bank', 'shop', 'casino', 'news', 'chans', 'ig']),
        defaultSkin: 'sidekick',
        textspeak: 'mid',
    },
    'y2k-late': {
        id: 'y2k-late',
        name: 'Late Y2K',
        range: '2009–2011',
        // ig = real Instagram (launched Oct 2010); tw = early Twitter (took off ~2009)
        apps: new Set(['list', 'bank', 'shop', 'casino', 'news', 'chans', 'tw', 'ig']),
        defaultSkin: 'bbry',
        textspeak: 'late',
    },
};

export const Y2K_SKINS = ['flip', 'sidekick', 'bbry'];

export function getEra() {
    const id = getSettings().era || 'modern';
    return ERAS[id] || ERAS.modern;
}

export function isModernEra() {
    return getEra().id === 'modern';
}

export function isAppAllowedInEra(appId) {
    const era = getEra();
    if (!era.apps) return true;
    if (ALWAYS_ON.has(appId)) return true;
    // Vibe mode: era hint still applies to texting voice and tile labels, but
    // every app stays on the home screen. Strict mode brings the filter back.
    if (!getSettings().strictEra) return true;
    return era.apps.has(appId);
}

// Lets other modules add a body class so era-wide CSS tweaks apply across the
// whole phone (not just the skin)
export function eraBodyClass() {
    return `gp-era-${getEra().id}`;
}

// Mid-Y2K rebrand of the Instagram app. The underlying app id stays "ig" so
// profiles, posts, follow/unfollow and the whole generation pipeline keep
// working — only the label and tile color on the home grid change.
export function igLabel() {
    return getEra().id === 'y2k-mid' ? 'MySpace' : 'Instagram';
}
export function igHomeStyle() {
    // Returns { className: extra class to add to the tile icon } so ui.js can
    // paint the home tile in MySpace blue in Mid Y2K and keep IG gradient elsewhere.
    return getEra().id === 'y2k-mid' ? 'gp-app-myspace' : '';
}

// Prompt hint injected when a Y2K era is on. Replaces the modern "TEXTING VOICE"
// block with period-appropriate abbreviations and emoticons.
export function eraTextspeakHint() {
    const era = getEra();
    switch (era.textspeak) {
        case 'early':
            return `[Y2K TEXTING VOICE — EARLY 2000s (2000–2004)] This is a feature-phone era. Typing on a numeric keypad is slow and every character is expensive. Every tel:sms "text" field obeys this voice:
- Keep messages SHORT — usually under 30 characters. If a thought is longer, split into multiple tags.
- MANDATORY lowercase. Mandatory abbreviations whenever natural: u (you), ur (your), r (are), b (be), 2 (to/too), 4 (for), b4, l8r, pls, thx, k, ok, hru, wat, wen, where, msg, cuz, bc, idk, lol, ttyl, brb, gtg, cya, omg, wtf, prolly, tho.
- NO modern emoji. Only text faces: :), :(, :P, ;), :D, :/, xD, <3, O.o
- Numbers can replace sounds: gr8, m8, w8, cre8, 2nite, 2moro, 4ever.
- Minimal punctuation. Drop apostrophes (dont, cant, wont, im, youre). Periods rare.
- MMS is new and expensive — characters mention "picture msg" or "pic" sparingly in prose; "photo" sms tag works but should be rare.
- No voice messages (voice:true tag never used in this era — technology didn't exist).`;
        case 'mid':
            return `[Y2K TEXTING VOICE — MID 2000s (2005–2008)] Sidekick / Razr / early iPhone era. Typing is faster (QWERTY keyboards, T9 word completion). Every tel:sms "text" obeys this voice:
- Lowercase default, few periods, short lines (phone-length, not paragraphs).
- Abbreviations relax but stay common: u, ur, r, 2, 4, pls, thx, k, lol, lmao, ttyl, brb, gtg, cya, omg, wtf, idk, imo, prolly, cuz, msg.
- Text faces still rule: :), :(, :D, ;), :P, <3, :/, xD, :3, >:( — alongside no modern emoji.
- AIM / MSN Messenger away-message vibe: characters might reference statuses ("brb lunch", "away: studying"), "pokes" and "nudges" exist on messenger platforms.
- Picture messages are normal now; voice messages still rare — only on BlackBerry-ish devices.`;
        case 'late':
            return `[Y2K TEXTING VOICE — LATE 2000s / EARLY 2010s (2009–2011)] BBM / early smartphone era. Full QWERTY keyboards standard. Every tel:sms "text" obeys this voice:
- Lowercase default, short lines, few periods. Common slang: u, ur, lol, lmao, omg, wtf, idk, ttyl, brb, gtg, srsly, totes, obvi, ikr, bby, hbu, wyd, nvm.
- Text faces still common (:), :(, <3, :P, :3) alongside the first basic emoji (❤ 😊) — but emoji sparse, text faces lead.
- BBM-specific flavor when it fits: "pin me", PIN numbers (eight hex), D/R delivery receipts, BBM groups. Chat happens on BBM, WhatsApp (new), or just plain SMS.
- No TikTok / Instagram / Snapchat exist. Twitter is new and nerdy. Facebook messages happen on actual Facebook, not a phone app.
- Picture messaging normal; voice messages still rare.`;
        default:
            return null;
    }
}

// Which classes a user might see in Appearance for Y2K phone shells. Keeps the
// visual catalog in one place so ui.js can decorate the theme cards consistently.
export const Y2K_THEME_INFO = [
    { id: 'flip', name: 'Flip Phone', note: '2000–2004', colors: ['#c8d680', '#8aa83a', '#1a1b14'] },
    { id: 'sidekick', name: 'Sidekick', note: '2005–2008', colors: ['#ff6b1c', '#ffb169', '#2b1d14'] },
    { id: 'bbry', name: 'BlackBerry', note: '2009–2011', colors: ['#c8102e', '#ff4d6a', '#1c1e26'] },
];
