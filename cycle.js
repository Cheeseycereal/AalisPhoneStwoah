// Cycle tracker: a plain period/symptom log for a character's phone.
// Deliberately scoped to cycle-day tracking, flow, symptoms and mood notes.
// No fertility %, no conception odds, no pregnancy/baby-care logic — just a log.
// Private by default, same pattern as notes.js: a "shared" toggle decides whether
// the current entry is visible to the narrator via the prompt injection.

import { getMeta, saveMeta } from './state.js';
import { logSocialToChat, removeJournalEntry, getUserName } from './social.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const SYMPTOM_OPTIONS = ['cramps', 'headache', 'bloating', 'fatigue', 'mood swings', 'back pain', 'nausea', 'tender chest', 'acne', 'insomnia'];

export function getCycle() {
    const m = getMeta();
    if (!m.cycle || typeof m.cycle !== 'object') {
        m.cycle = {
            avgLength: 28,      // days, editable
            periodLength: 5,    // days, editable
            lastStart: null,    // ISO date (rp-time) of most recent period start
            entries: [],        // [{id, date, flow, symptoms:[], mood, note, shared}]
        };
    }
    if (!Array.isArray(m.cycle.entries)) m.cycle.entries = [];
    return m.cycle;
}

export function setCycleSettings({ avgLength, periodLength } = {}) {
    const c = getCycle();
    if (Number.isFinite(avgLength) && avgLength >= 15 && avgLength <= 60) c.avgLength = Math.round(avgLength);
    if (Number.isFinite(periodLength) && periodLength >= 1 && periodLength <= 14) c.periodLength = Math.round(periodLength);
    saveMeta();
}

export function logPeriodStart(dateIso) {
    const c = getCycle();
    c.lastStart = dateIso;
    saveMeta();
}

export function addEntry({ date, flow, symptoms, mood, note }) {
    const c = getCycle();
    const entry = {
        id: genId(),
        date: String(date || '').slice(0, 10),
        flow: ['none', 'light', 'medium', 'heavy'].includes(flow) ? flow : 'none',
        symptoms: Array.isArray(symptoms) ? symptoms.filter(s => SYMPTOM_OPTIONS.includes(s)).slice(0, 10) : [],
        mood: String(mood || '').slice(0, 60),
        note: String(note || '').slice(0, 500),
        shared: false,
        time: Date.now(),
    };
    c.entries.unshift(entry);
    // Logging a "heavy"/"medium"/"light" flow entry on a fresh date starting a new
    // stretch counts as the period start, so day-count math stays accurate without
    // a separate manual step.
    if (entry.flow !== 'none' && (!c.lastStart || daysBetween(c.lastStart, entry.date) >= (c.periodLength + 3))) {
        c.lastStart = entry.date;
    }
    saveMeta();
    return entry;
}

export function updateEntry(id, patch) {
    const c = getCycle();
    const e = c.entries.find(x => x.id === id);
    if (!e) return false;
    if (patch.flow && ['none', 'light', 'medium', 'heavy'].includes(patch.flow)) e.flow = patch.flow;
    if (Array.isArray(patch.symptoms)) e.symptoms = patch.symptoms.filter(s => SYMPTOM_OPTIONS.includes(s)).slice(0, 10);
    if (typeof patch.mood === 'string') e.mood = patch.mood.slice(0, 60);
    if (typeof patch.note === 'string') e.note = patch.note.slice(0, 500);
    saveMeta();
    if (e.shared) { removeJournalEntry(entryMarker(e.id)); journalEntry(e, 'updated'); }
    return true;
}

export function deleteEntry(id) {
    const c = getCycle();
    const gone = c.entries.find(x => x.id === id);
    c.entries = c.entries.filter(x => x.id !== id);
    saveMeta();
    if (gone?.shared) removeJournalEntry(entryMarker(id));
}

function entryMarker(id) { return `cycle:${id}`; }

function journalEntry(e, verb) {
    try {
        const bits = [];
        if (e.flow !== 'none') bits.push(`flow: ${e.flow}`);
        if (e.symptoms.length) bits.push(`symptoms: ${e.symptoms.join(', ')}`);
        if (e.mood) bits.push(`mood: ${e.mood}`);
        if (e.note) bits.push(`note: "${e.note.slice(0, 200)}"`);
        logSocialToChat(`${getUserName()} ${verb} a cycle log entry for ${e.date}${bits.length ? ` (${bits.join(' · ')})` : ''}`,
            { marker: entryMarker(e.id), priv: true });
    } catch (err) { /* ignore */ }
}

export function toggleEntryShared(id) {
    const c = getCycle();
    const e = c.entries.find(x => x.id === id);
    if (!e) return false;
    e.shared = !e.shared;
    saveMeta();
    if (e.shared) journalEntry(e, 'shares');
    else removeJournalEntry(entryMarker(e.id));
    return e.shared;
}

export function getSharedEntries() {
    return getCycle().entries.filter(e => e.shared);
}

function daysBetween(isoA, isoB) {
    const a = new Date(isoA + 'T00:00:00');
    const b = new Date(isoB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
}

// Cycle-day math is descriptive only: which day of the cycle it is, and whether
// it currently falls inside the logged period window or the days right before it
// (a plain PMS-window flag). No fertility estimate, no conception odds.
export function cycleStatus(todayIso) {
    const c = getCycle();
    if (!c.lastStart) return null;
    const len = c.avgLength || 28;
    const periodLen = c.periodLength || 5;
    let day = (daysBetween(c.lastStart, todayIso) % len) + 1;
    if (day < 1) day += len;
    const inPeriod = day <= periodLen;
    const pmsWindow = !inPeriod && day >= len - 4; // last ~4 days before the next expected start
    const daysUntilNext = inPeriod ? null : (len - day + 1);
    return { day, length: len, periodLength: periodLen, inPeriod, pmsWindow, daysUntilNext };
}

export { SYMPTOM_OPTIONS };

// Optional inject block — only appears if at least one entry is marked shared,
// same opt-in pattern as notes.js. Purely descriptive (day count / symptoms the
// user chose to note), no medical or reproductive framing.
export function cycleInjectBlock(todayIso) {
    const shared = getSharedEntries();
    const status = cycleStatus(todayIso);
    if (!shared.length && !status) return '';
    const lines = [];
    if (status) {
        lines.push(`- Cycle day ${status.day}/${status.length}${status.inPeriod ? ' (period)' : status.pmsWindow ? ' (PMS window)' : ''}`);
    }
    shared.slice(0, 5).forEach(e => {
        const bits = [];
        if (e.flow !== 'none') bits.push(`flow ${e.flow}`);
        if (e.symptoms.length) bits.push(e.symptoms.join(', '));
        if (e.mood) bits.push(`mood: ${e.mood}`);
        if (e.note) bits.push(`"${e.note.slice(0, 150)}"`);
        lines.push(`- ${e.date}: ${bits.join(' · ') || 'logged'}`);
    });
    if (!lines.length) return '';
    return `[{{user}}'S CYCLE LOG — what they tracked in their phone and chose to share. Treat as true background: it can inform how {{user}} is feeling physically (energy, comfort, mood) but is not something other characters know unless {{user}} tells them.]\n${lines.join('\n')}`;
}
