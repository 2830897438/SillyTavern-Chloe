import path from 'node:path';
import { promises as fsPromises } from 'node:fs';

import express from 'express';
import storage from 'node-persist';

import { getUserDirectories, toKey } from '../users.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACCOUNT_PREFIX = 'account:';
const REDEEM_CODE_PREFIX = 'redeem:';

/**
 * @typedef {Object} AccountState
 * @property {string} handle
 * @property {number} points
 * @property {boolean} accessOn
 * @property {number} lastCostAppliedAt Epoch ms at local midnight when cost was last applied
 * @property {string} lastCheckInDate YYYY-MM-DD for daily check-in limiter
 * @property {number|null} accessOffSince Epoch ms when entered OFF state (for 30 days purge)
 * @property {number} createdAt Epoch ms when the state was created
 */

function toAccountKey(handle) {
    return `${ACCOUNT_PREFIX}${handle}`;
}

function toRedeemCodeKey(code) {
    return `${REDEEM_CODE_PREFIX}${code.toUpperCase()}`;
}

function toDateString(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
}

function todayMidnight(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/**
 * Initialize account state if missing.
 * @param {string} handle
 * @returns {Promise<AccountState>}
 */
async function getOrInitState(handle) {
    /** @type {AccountState | undefined} */
    const existing = await storage.getItem(toAccountKey(handle));
    if (existing) return existing;

    /** @type {AccountState} */
    const initial = {
        handle,
        points: 20,
        accessOn: true,
        lastCostAppliedAt: todayMidnight(),
        lastCheckInDate: '',
        accessOffSince: null,
        createdAt: Date.now(),
    };
    await storage.setItem(toAccountKey(handle), initial);
    return initial;
}

/**
 * Applies daily costs since lastCostAppliedAt up to today midnight.
 * Also enforces 30-day purge on continuous OFF.
 * @param {AccountState} state
 * @returns {Promise<AccountState>}
 */
async function applyDailyCosts(state) {
    const nowMid = todayMidnight();
    let appliedFrom = state.lastCostAppliedAt || todayMidnight(state.createdAt || Date.now());
    if (appliedFrom > nowMid) {
        state.lastCostAppliedAt = nowMid;
        return state;
    }

    const days = Math.floor((nowMid - appliedFrom) / MS_PER_DAY);
    if (days > 0) {
        const rate = state.accessOn ? 1 : 0;
        const cost = days * rate;
        state.points = Math.max(0, Math.round((state.points - cost) * 2) / 2);
        state.lastCostAppliedAt = appliedFrom + days * MS_PER_DAY;
        await storage.setItem(toAccountKey(state.handle), state);
    }

    // Purge if OFF >= 30 days
    if (state.accessOn === false && state.accessOffSince && (Date.now() - state.accessOffSince) >= 30 * MS_PER_DAY) {
        await purgeUserData(state.handle);
        // After purge, reset account state to initial with 0 points and OFF
        state.points = 0;
        state.accessOn = false;
        state.lastCheckInDate = '';
        state.accessOffSince = todayMidnight();
        state.lastCostAppliedAt = todayMidnight();
        await storage.setItem(toAccountKey(state.handle), state);
        // Signal purge via flag on response level (handled in routes) by attaching property
        // but we keep state persisted as zeroed so future requests are consistent.
        // The route will add { purged: true } in response separately.
    }

    return state;
}

async function purgeUserData(handle) {
    try {
        const userKey = toKey(handle);
        await storage.removeItem(userKey);
        const directories = getUserDirectories(handle);
        await fsPromises.rm(directories.root, { recursive: true, force: true });
    } catch (err) {
        // Log but do not crash; continue flow
        console.warn('purgeUserData failed for', handle, err?.message || err);
    }
}

/**
 * Builds a serializable status payload for the current request user.
 * @param {import('express').Request} req
 */
async function buildStatus(req) {
    const handle = req.user?.profile?.handle;
    const name = req.user?.profile?.name;
    if (!handle) throw new Error('No user in request');
    let state = await getOrInitState(handle);
    const beforeOffSince = state.accessOffSince;
    state = await applyDailyCosts(state);

    const offDays = state.accessOn || !state.accessOffSince
        ? 0
        : Math.floor((todayMidnight() - todayMidnight(state.accessOffSince)) / MS_PER_DAY);
    const canCheckInToday = state.lastCheckInDate !== toDateString(Date.now());

    const didPurge = beforeOffSince && !state.accessOn && (Date.now() - beforeOffSince) >= 30 * MS_PER_DAY;

    return {
        handle,
        name,
        points: state.points,
        accessOn: state.accessOn,
        offDays,
        canCheckInToday,
        purged: !!didPurge,
    };
}

export const router = express.Router();

// Get current account status
router.get('/status', async (req, res) => {
    try {
        if (!req.user) return res.sendStatus(403);
        const status = await buildStatus(req);
        return res.json(status);
    } catch (err) {
        console.error('account/status failed', err);
        return res.sendStatus(500);
    }
});

// Daily check-in: +5 points once per calendar day
router.post('/checkin', async (req, res) => {
    try {
        if (!req.user) return res.sendStatus(403);
        const handle = req.user.profile.handle;
        let state = await getOrInitState(handle);
        state = await applyDailyCosts(state);
        const today = toDateString(Date.now());
        if (state.lastCheckInDate === today) {
            return res.status(400).json({ error: '今日已签到' });
        }
        state.points = Math.round((state.points + 5) * 2) / 2;
        state.lastCheckInDate = today;
        await storage.setItem(toAccountKey(handle), state);
        return res.json({ points: state.points, lastCheckInDate: state.lastCheckInDate });
    } catch (err) {
        console.error('account/checkin failed', err);
        return res.sendStatus(500);
    }
});

// Toggle access on/off
router.post('/toggle', async (req, res) => {
    try {
        if (!req.user) return res.sendStatus(403);
        const handle = req.user.profile.handle;
        const desired = typeof req.body?.accessOn === 'boolean' ? req.body.accessOn : undefined;
        if (typeof desired !== 'boolean') {
            return res.status(400).json({ error: 'Missing accessOn boolean' });
        }
        let state = await getOrInitState(handle);
        state = await applyDailyCosts(state);
        if (state.accessOn !== desired) {
            if (desired === true) {
                // Activation fee: requires and deducts 1 point immediately
                if ((state.points ?? 0) < 1) {
                    return res.status(400).json({ error: '积分不足，无法开启（需要 1 积分）' });
                }
                state.points = Math.max(0, Math.round((state.points - 1) * 2) / 2);
                state.accessOn = true;
                state.accessOffSince = null;
            } else {
                state.accessOn = false;
                state.accessOffSince = Date.now();
            }
            await storage.setItem(toAccountKey(handle), state);
        }
        return res.json({ accessOn: state.accessOn, points: state.points });
    } catch (err) {
        console.error('account/toggle failed', err);
        return res.sendStatus(500);
    }
});

// Redeem code: adds points to account
router.post('/redeem', async (req, res) => {
    try {
        if (!req.user) return res.sendStatus(403);
        const handle = req.user.profile.handle;
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: '请输入兑换码' });
        }

        const codeKey = toRedeemCodeKey(code);
        const redeemData = await storage.getItem(codeKey);

        if (!redeemData) {
            return res.status(404).json({ error: '兑换码不存在或已失效' });
        }

        if (redeemData.used) {
            return res.status(400).json({ error: '此兑换码已被使用' });
        }

        // Mark code as used
        redeemData.used = true;
        redeemData.usedBy = handle;
        redeemData.usedAt = Date.now();
        await storage.setItem(codeKey, redeemData);

        // Add points to user account
        let state = await getOrInitState(handle);
        state = await applyDailyCosts(state);
        state.points = Math.round((state.points + redeemData.points) * 2) / 2;
        await storage.setItem(toAccountKey(handle), state);

        return res.json({
            success: true,
            points: state.points,
            addedPoints: redeemData.points,
            message: `成功兑换 ${redeemData.points} 积分`,
        });
    } catch (err) {
        console.error('account/redeem failed', err);
        return res.sendStatus(500);
    }
});

// Helper used by server-main for gating /app
export async function getEffectiveAccess(req) {
    if (!req.user) return { allowed: false, reason: 'NOT_LOGGED_IN' };
    const handle = req.user.profile.handle;
    let state = await getOrInitState(handle);
    state = await applyDailyCosts(state);
    if (!state.accessOn) return { allowed: false, reason: 'OFF' };
    if (state.points <= 0) return { allowed: false, reason: 'NO_POINTS' };
    return { allowed: true };
}

export default router;
