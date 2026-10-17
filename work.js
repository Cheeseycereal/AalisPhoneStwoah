// Work: job openings, getting hired, shifts, career ladder.
// Ported from Delidgi-meow/Phone-ST (v2.15.x "Work" app, GPL-3.0), which was
// removed upstream in v2.14.4. Original idea and code by Delidgi; translated to
// English and put behind a settings toggle (off by default) in this fork.
// Everything is generated lazily (on button press) and stored per chat in meta.

import { getMeta, saveMeta, getRpDateTime, getSettings } from './state.js';
import { generateJobListings, generateShiftOutcome, generatePromotionVerdict, logSocialToChat, getUserName } from './social.js';
import { addTransaction, fmtMoney } from './bank.js';

// Bank category key. 'зарплата' is the internal id the bank already uses for
// income (it is displayed as "salary"), so keep it as is.
const SALARY_CAT = 'зарплата';

export function workEnabled() { return getSettings().workEnabled === true; }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function getWork() {
    const m = getMeta();
    if (!m.work || typeof m.work !== 'object') m.work = {};
    const w = m.work;
    if (!Array.isArray(w.listings)) w.listings = [];   // current openings
    if (!('job' in w)) w.job = null;                   // where they work now
    if (!Array.isArray(w.history)) w.history = [];     // past jobs
    return w;
}

export function currentJob() { return getWork().job; }

// ── Openings ──
let _inflight = false;

export async function refreshListings() {
    if (_inflight) throw new Error('Already generating');
    _inflight = true;
    try {
        const w = getWork();
        const arr = await generateJobListings(w.listings.map(l => l.title), w.job);
        if (!Array.isArray(arr) || !arr.length) throw new Error('No openings found, try again');
        w.listings = arr.filter(j => j && j.title).slice(0, 8).map(j => ({
            id: genId(),
            title: String(j.title).slice(0, 60),
            company: String(j.company || '').slice(0, 50),
            field: String(j.field || '').slice(0, 40),
            salary: Math.max(0, Math.round(Number(j.salary) || 0)),
            schedule: String(j.schedule || '').slice(0, 60),
            requirements: String(j.requirements || '').slice(0, 200),
            duties: String(j.duties || '').slice(0, 200),
            tasks: (Array.isArray(j.tasks) ? j.tasks : []).slice(0, 4).map(t => String(t?.text || t || '').slice(0, 200)).filter(Boolean),
            // Ladder: where this position can grow to
            ladder: (Array.isArray(j.ladder) ? j.ladder : []).slice(0, 5).map((s, i) => ({
                title: String(s?.title || '').slice(0, 60),
                salary: Math.max(0, Math.round(Number(s?.salary) || 0)),
                level: i,
            })).filter(s => s.title),
        }));
        saveMeta();
        return w.listings.length;
    } finally {
        _inflight = false;
    }
}

// ── Getting hired ──
export function takeJob(listingId) {
    const w = getWork();
    const l = w.listings.find(x => x.id === listingId);
    if (!l) return null;
    if (w.job) leaveJob({ silent: true });
    w.job = {
        id: genId(),
        title: l.title, company: l.company, field: l.field,
        salary: l.salary, schedule: l.schedule, duties: l.duties,
        ladder: l.ladder || [],
        level: 0,              // rung on the ladder
        shifts: 0,             // shifts worked
        performance: 50,       // how they are coping, 0..100
        startedAt: Date.now(),
        lastPaidMonth: null,
        tasks: (l.tasks || []).slice(0, 4).map(t => ({ id: genId(), text: String(t).slice(0, 200), done: false, at: Date.now() })),
    };
    w.listings = w.listings.filter(x => x.id !== listingId);
    saveMeta();
    try {
        logSocialToChat(`${getUserName()} starts a new job: ${l.title}${l.company ? ` (${l.company})` : ''}, ${fmtMoney(l.salary)} per month`);
    } catch (e) { /* ignore */ }
    return w.job;
}

export function leaveJob({ silent = false } = {}) {
    const w = getWork();
    if (!w.job) return false;
    w.history.unshift({ ...w.job, endedAt: Date.now() });
    w.history = w.history.slice(0, 10);
    const gone = w.job;
    w.job = null;
    saveMeta();
    if (!silent) {
        try {
            logSocialToChat(`${getUserName()} quits their job: ${gone.title}${gone.company ? ` (${gone.company})` : ''}`);
        } catch (e) { /* ignore */ }
    }
    return true;
}

// ── Shift ──
// Work a shift: the model describes how it went, that moves the score and
// brings money. Pay is a share of the monthly salary.
export async function workShift() {
    const w = getWork();
    const job = w.job;
    if (!job) throw new Error('You are not working anywhere');
    const out = await generateShiftOutcome(job);
    if (!out || !out.summary) throw new Error('The shift could not be described, try again');
    const delta = Math.max(-15, Math.min(15, Math.round(Number(out.performance_delta) || 0)));
    job.performance = Math.max(0, Math.min(100, job.performance + delta));
    job.shifts++;
    const pay = Math.max(1, Math.round(job.salary / 22));   // about one working day of a month
    addTransaction({ amount: pay, label: `Shift: ${job.title}`, category: SALARY_CAT, silent: true });
    job.lastShift = { summary: String(out.summary).slice(0, 600), delta, pay, at: Date.now() };
    if (Array.isArray(out.tasks) && out.tasks.length) addTasks(out.tasks);
    saveMeta();
    try {
        logSocialToChat(`${getUserName()} worked a shift: ${job.title}. ${job.lastShift.summary}`);
    } catch (e) { /* ignore */ }
    return job.lastShift;
}

// ── Promotion ──
export function nextStep(job = currentJob()) {
    if (!job || !Array.isArray(job.ladder)) return null;
    return job.ladder[job.level] || null;
}

// Ready for a promotion: shifts and score. The bar rises with each rung,
// so the higher you sit, the longer the wait for the next one.
export function promotionReady(job = currentJob()) {
    const step = nextStep(job);
    if (!step) return { ready: false, need: null };
    const needShifts = 5 + job.level * 4;
    const needPerf = 60 + job.level * 5;
    return {
        ready: job.shifts >= needShifts && job.performance >= needPerf,
        need: { shifts: needShifts, performance: needPerf },
        step,
    };
}

export async function askPromotion() {
    const w = getWork();
    const job = w.job;
    if (!job) throw new Error('You are not working anywhere');
    const step = nextStep(job);
    if (!step) throw new Error('Nowhere higher to go');
    const verdict = await generatePromotionVerdict(job, step, promotionReady(job));
    if (!verdict) throw new Error('Your manager is silent, try again');
    const granted = !!verdict.granted;
    if (granted) {
        job.level++;
        job.title = step.title;
        job.salary = step.salary || Math.round(job.salary * 1.3);
        job.performance = Math.max(40, job.performance - 10);   // new role, prove yourself again
    }
    job.lastVerdict = { granted, text: String(verdict.text || '').slice(0, 600), at: Date.now() };
    saveMeta();
    try {
        logSocialToChat(granted
            ? `${getUserName()} gets a promotion: now ${job.title}, ${fmtMoney(job.salary)} per month. ${job.lastVerdict.text}`
            : `${getUserName()} asks for a promotion and is turned down. ${job.lastVerdict.text}`);
    } catch (e) { /* ignore */ }
    return job.lastVerdict;
}

// ── Salary ──
// Paid once per month of roleplay time, the first time the phone opens in a new month
function currentYearMonth() {
    const d = getRpDateTime();
    if (d && Number.isFinite(d.year)) return `${d.year}-${String(d.month).padStart(2, '0')}`;
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export function paySalaryIfDue() {
    if (!workEnabled()) return null;
    const job = currentJob();
    if (!job || !job.salary) return null;
    const ym = currentYearMonth();
    if (job.lastPaidMonth === ym) return null;
    // The first month on the job is not paid retroactively
    if (!job.lastPaidMonth) { job.lastPaidMonth = ym; saveMeta(); return null; }
    job.lastPaidMonth = ym;
    addTransaction({ amount: job.salary, label: `Salary: ${job.title}`, category: SALARY_CAT, silent: true });
    saveMeta();
    return { amount: job.salary, title: job.title };
}

// ── Tasks from the boss ──
// They live on the job card. Tick them by hand, or play them out in the roleplay:
// the model closes the task with the same tag that marks a shift.
export function addTasks(list) {
    const job = currentJob();
    if (!job || !Array.isArray(list)) return 0;
    if (!Array.isArray(job.tasks)) job.tasks = [];
    let n = 0;
    for (const t of list) {
        const text = String(t?.text || t || '').trim().slice(0, 200);
        if (!text || job.tasks.some(x => x.text === text)) continue;
        job.tasks.push({ id: genId(), text, done: false, at: Date.now() });
        n++;
    }
    job.tasks = job.tasks.slice(-8);
    if (n) saveMeta();
    return n;
}

export function toggleTask(id) {
    const job = currentJob();
    const t = job?.tasks?.find(x => x.id === id);
    if (!t) return false;
    t.done = !t.done;
    if (t.done) { job.performance = Math.min(100, job.performance + 3); }
    saveMeta();
    return t.done;
}

// Close a task from a description in the roleplay: match on notable words,
// because the model will retell it in its own words rather than verbatim
function closeTaskByText(job, text) {
    const words = String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 5);
    if (!words.length) return null;
    const hit = (job.tasks || []).find(t => {
        if (t.done) return false;
        const tw = t.text.toLowerCase();
        return words.filter(w => tw.includes(w)).length >= 2;
    });
    if (!hit) return null;
    hit.done = true;
    job.performance = Math.min(100, job.performance + 3);
    return hit;
}

// ── Shifts played out in the roleplay ──
// The model adds <!--tel:work:{...}--> when {{user}} worked in the scene.
const WORK_TAG_RE = /<!--\s*tel:work:(\{[\s\S]*?\})\s*-->/gi;

function safeJson(raw) {
    try { return JSON.parse(raw); } catch (e) {
        try { return JSON.parse(String(raw).replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')); } catch (e2) { return null; }
    }
}

export function harvestWorkTags() {
    if (!workEnabled()) return 0;
    const w = getWork();
    const job = w.job;
    if (!job) return 0;
    if (!Array.isArray(w.seenTags)) w.seenTags = [];
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return 0; }
    const seen = new Set(w.seenTags);
    let counted = 0;
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || !msg.mes || msg.is_user) continue;
        WORK_TAG_RE.lastIndex = 0;
        let m;
        while ((m = WORK_TAG_RE.exec(String(msg.mes))) !== null) {
            const key = `wk${m[1].length}:${String(msg.send_date || msg.extra?.gen_id || i)}:${m.index}`;
            if (seen.has(key)) continue;
            seen.add(key); w.seenTags.push(key);
            const j = safeJson(m[1]);
            if (!j) continue;
            const closed = j.task ? closeTaskByText(job, j.task) : null;
            if (j.shift !== false) {
                const delta = Math.max(-15, Math.min(15, Math.round(Number(j.delta) || 2)));
                job.performance = Math.max(0, Math.min(100, job.performance + delta));
                job.shifts++;
                const pay = Math.max(1, Math.round(job.salary / 22));
                addTransaction({ amount: pay, label: `Shift: ${job.title}`, category: SALARY_CAT, silent: true });
                job.lastShift = {
                    summary: String(j.summary || 'Shift played out in the roleplay.').slice(0, 600),
                    delta, pay, at: Date.now(), fromRp: true,
                };
                counted++;
            } else if (closed) {
                counted++;
            }
        }
    }
    if (w.seenTags.length > 200) w.seenTags = w.seenTags.slice(-200);
    if (counted) saveMeta();
    return counted;
}

// Line for the prompt injection: the roleplay needs to know where {{user}} works
export function workInjectLine() {
    if (!workEnabled()) return '';
    const job = currentJob();
    if (!job) return '';
    const step = nextStep(job);
    const open = (job.tasks || []).filter(t => !t.done).map(t => t.text);
    let out = `- Work: ${job.title}${job.company ? ` at ${job.company}` : ''}, ${fmtMoney(job.salary)}/month, ${job.schedule || 'schedule unspecified'}. `
        + `Shifts worked: ${job.shifts}; how they are coping: ${job.performance}/100.`
        + (step ? ` Next step on the ladder: ${step.title}.` : ' Top of the ladder.');
    if (open.length) out += `\n- Open work tasks: ${open.join('; ')}.`;
    out += `\n- If {{user}} actually works a shift or handles a work task IN THE SCENE, append at the very END:`
        + `\n<!--tel:work:{"summary":"one sentence about how the shift went","delta":2}-->`
        + ` — delta from -15 to +15 is how well it went. Add "task":"which task was handled" if they closed one of the open tasks;`
        + ` add "shift":false if it was only a task and not a whole shift. One tag per shift, never for merely talking about work.`;
    return out;
}

export function workActive() {
    const w = getWork();
    return !!(w.job || w.listings.length || w.history.length);
}
