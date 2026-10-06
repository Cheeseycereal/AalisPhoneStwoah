// Casino: slots and roulette played with bank money. All math is local and
// runs honest house odds (the house is always ahead over time) — no LLM.

import { getMeta, saveMeta } from './state.js';
import { getBank, addTransaction } from './bank.js';

function getCasino() {
    const m = getMeta();
    if (!m.casino || typeof m.casino !== 'object') m.casino = {};
    const c = m.casino;
    if (!Number.isFinite(c.spins)) c.spins = 0;
    if (!Number.isFinite(c.won)) c.won = 0;
    if (!Number.isFinite(c.lost)) c.lost = 0;
    if (!Number.isFinite(c.bestWin)) c.bestWin = 0;
    if (!Number.isFinite(c.wagered)) c.wagered = c.lost || 0;
    return c;
}
export function casinoStats() { return getCasino(); }

function settle(bet, win, label) {
    const c = getCasino();
    c.spins++;
    addTransaction({ amount: -bet, label, category: 'casino', silent: true });
    if (win > 0) {
        addTransaction({ amount: win, label: `Win: ${label}`, category: 'casino', silent: true });
        c.won += win;
        if (win > c.bestWin) c.bestWin = win;
    }
    c.wagered = (c.wagered || 0) + bet;   // total wagered (not "lost")
    c.lost = c.wagered;                    // old field name kept for existing chats
    saveMeta();
}

export function canBet(bet) {
    const b = getBank();
    return Number.isFinite(bet) && bet > 0 && b.balance >= bet;
}

// ── Slots: 3 reels, weighted symbols ──
// 89% payout: house stays ahead, but jackpots do happen. Calculated as
// Σ p(combo) × multiplier — the payouts are tuned to hit that number, don't
// change them by eye: a pair of lemons lands about one spin in five, and any
// payout for it pushed the machine into the red (it was 115% — the casino
// was giving money away).
const SLOT_SYMBOLS = [
    { icon: 'fa-lemon', w: 30, three: 4, two: 0 },
    { icon: 'fa-heart', w: 25, three: 6, two: 1 },
    { icon: 'fa-star', w: 20, three: 10, two: 2 },
    { icon: 'fa-bolt', w: 14, three: 20, two: 2 },
    { icon: 'fa-gem', w: 8, three: 50, two: 4 },
    { icon: 'fa-crown', w: 3, three: 200, two: 8 },
];
const SLOT_TOTAL_W = SLOT_SYMBOLS.reduce((s, x) => s + x.w, 0);
function slotSymbol() {
    let r = Math.random() * SLOT_TOTAL_W;
    for (const s of SLOT_SYMBOLS) { r -= s.w; if (r <= 0) return s; }
    return SLOT_SYMBOLS[0];
}

export function spinSlots(bet) {
    bet = Math.round(bet);
    if (!canBet(bet)) return null;
    const reels = [slotSymbol(), slotSymbol(), slotSymbol()];
    let mult = 0;
    if (reels[0].icon === reels[1].icon && reels[1].icon === reels[2].icon) mult = reels[0].three;
    else if (reels[0].icon === reels[1].icon || reels[1].icon === reels[2].icon || reels[0].icon === reels[2].icon) {
        const dup = reels[0].icon === reels[1].icon || reels[0].icon === reels[2].icon ? reels[0] : reels[1];
        mult = dup.two;
    }
    const win = Math.round(bet * mult);
    settle(bet, win, 'Slots');
    return { reels: reels.map(r => r.icon), mult, win, bet };
}

// ── Roulette: red/black (×2, zero — house) or a number 0-36 (×36) ──
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function spinRoulette(bet, betType, betNumber = null) {
    bet = Math.round(bet);
    if (!canBet(bet)) return null;
    const result = Math.floor(Math.random() * 37); // 0-36
    const color = result === 0 ? 'green' : (RED_NUMBERS.has(result) ? 'red' : 'black');
    let win = 0;
    if (betType === 'red' && color === 'red') win = bet * 2;
    else if (betType === 'black' && color === 'black') win = bet * 2;
    else if (betType === 'num' && Number(betNumber) === result) win = bet * 36;
    settle(bet, win, 'Roulette');
    return { result, color, win, bet };
}
