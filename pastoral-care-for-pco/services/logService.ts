
/**
 * logService.ts
 *
 * Centralized logging service for the pastoral-care-for-pco application.
 *
 * - Writes structured logs to Firestore `logs` collection (fire-and-forget)
 * - Mirrors all output to console so Cloud Run / Google Cloud Logging also captures them
 * - Callers are never blocked by logging (no await required)
 *
 * Usage (client-side / services):
 *   import { logger } from './logService';
 *   logger.info('Sync started', 'sync', { churchId });
 *   logger.warn('Rate limit hit', 'sync', { endpoint, retryCount });
 *   logger.error('Token refresh failed', 'proxy', { churchId, statusCode: 401 });
 *
 * For backend/ server files (pcoProxy, pcoWebhookHandler) use serverLogger:
 *   import { serverLogger } from '../services/logService';
 *   serverLogger.info('Webhook received', 'webhook', { eventName }, churchId);
 */

import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { LogEntry } from '../types';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogSource = 'sync' | 'webhook' | 'proxy' | 'auth' | 'app' | 'system';

// ─── In-memory ring buffer (for dev quick-access without Firestore round-trip) ─
const _buffer: LogEntry[] = [];
const MAX_BUFFER = 200;

// ─── Core write function (client SDK) ────────────────────────────────────────

const writeToFirestore = (entry: LogEntry): void => {
    addDoc(collection(db, 'logs'), entry).catch((err) => {
        // Never recurse — raw console only
        console.error('[LogService] Failed to persist log:', err?.message ?? err);
    });
};

const buildEntry = (
    level: LogLevel,
    message: string,
    source: LogSource,
    context?: Record<string, any>,
    churchId?: string
): LogEntry => ({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    churchId: churchId ?? 'system',
    timestamp: Date.now(),
    level,
    source,
    message,
    details: context ? JSON.stringify(context) : undefined,
    context,
});

const write = (
    level: LogLevel,
    message: string,
    source: LogSource = 'app',
    context?: Record<string, any>,
    churchId?: string
): void => {
    const entry = buildEntry(level, message, source, context, churchId);

    // 1. Console (Cloud Run → Google Cloud Logging)
    const tag = `[${source.toUpperCase()}]`;
    if (level === 'error') console.error(tag, message, context ?? '');
    else if (level === 'warn') console.warn(tag, message, context ?? '');
    else console.log(tag, message, context ?? '');

    // 2. In-memory buffer
    _buffer.unshift(entry);
    if (_buffer.length > MAX_BUFFER) _buffer.pop();

    // 3. Firestore (fire-and-forget — uses client SDK)
    writeToFirestore(entry);
};

// ─── Public client-side logger ────────────────────────────────────────────────

export const logger = {
    info: (message: string, source: LogSource = 'app', context?: Record<string, any>, churchId?: string) =>
        write('info', message, source, context, churchId),

    warn: (message: string, source: LogSource = 'app', context?: Record<string, any>, churchId?: string) =>
        write('warn', message, source, context, churchId),

    error: (message: string, source: LogSource = 'app', context?: Record<string, any>, churchId?: string) =>
        write('error', message, source, context, churchId),

    /** Access the in-memory recent log buffer without a Firestore read */
    getRecent: (): LogEntry[] => [..._buffer],

    clearBuffer: () => { _buffer.length = 0; },
};

// ─── Server-side logger (firebase-admin — for backend/ files) ────────────────
// backend/ files run in Node.js and cannot use the browser Firebase client SDK.
// This helper writes via firebase-admin and is imported by pcoProxy, pcoWebhookHandler.

const writeServerEntry = (
    adminDb: any,
    level: LogLevel,
    message: string,
    source: LogSource,
    context?: Record<string, any>,
    churchId?: string
): void => {
    const entry = buildEntry(level, message, source, context, churchId);

    const tag = `[${source.toUpperCase()}]`;
    if (level === 'error') console.error(tag, message, context ?? '');
    else if (level === 'warn') console.warn(tag, message, context ?? '');
    else console.log(tag, message, context ?? '');

    // Fire-and-forget admin write
    adminDb.collection('logs').add(entry).catch((err: any) => {
        console.error('[LogService] Failed to persist server log:', err?.message ?? err);
    });
};

/**
 * createServerLogger — factory for backend/ files.
 * Pass in the Firestore admin `db` instance so we avoid ESM circular imports.
 *
 * Example:
 *   import { createServerLogger } from '../services/logService';
 *   const log = createServerLogger(db);
 *   log.info('Proxy received request', 'proxy', { url }, churchId);
 */
export const createServerLogger = (adminDb: any) => ({
    info: (message: string, source: LogSource = 'app', context?: Record<string, any>, churchId?: string) =>
        writeServerEntry(adminDb, 'info', message, source, context, churchId),
    warn: (message: string, source: LogSource = 'app', context?: Record<string, any>, churchId?: string) =>
        writeServerEntry(adminDb, 'warn', message, source, context, churchId),
    error: (message: string, source: LogSource = 'app', context?: Record<string, any>, churchId?: string) =>
        writeServerEntry(adminDb, 'error', message, source, context, churchId),
});
