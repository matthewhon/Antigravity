/**
 * pcoSyncCore.ts
 * Shared primitives used by all domain sync modules:
 *   - Server-side logger (no-op in browser)
 *   - pcoFetch (PCO API proxy with rate-limit retry)
 *   - fetchAllPages (paginated fetch helper)
 *   - delay utility
 */

import { createServerLogger } from '../logService';

// Server-side logger — only initialised when running in Node.js.
let serverLogger: any = null;
if (typeof window === 'undefined') {
    const modName = 'module';
    import(modName).then(m => {
        const require = m.createRequire(import.meta.url);
        const { getDb } = require('../../backend/firebase');
        serverLogger = createServerLogger(getDb());
    }).catch(err => {
        console.error('Failed to initialize server logger:', err);
    });
}

export const logger = {
    info: (msg: string, ...rest: any[]) => {
        if (serverLogger) {
            serverLogger.info(msg, ...rest);
        } else {
            console.log('[sync]', msg, ...rest);
        }
    },
    warn: (msg: string, ...rest: any[]) => {
        if (serverLogger) {
            serverLogger.warn(msg, ...rest);
        } else {
            console.warn('[sync]', msg, ...rest);
        }
    },
    error: (msg: string, ...rest: any[]) => {
        if (serverLogger) {
            serverLogger.error(msg, ...rest);
        } else {
            console.error('[sync]', msg, ...rest);
        }
    }
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getProxyUrl = async () => {
    if (typeof window === 'undefined') {
        const port = process.env.PORT || 8080;
        return `http://127.0.0.1:${port}/pco/proxy`;
    }
    return '/pco/proxy';
};

export const pcoFetch = async (
    churchId: string,
    endpoint: string,
    retryCount = 0,
    method = 'GET',
    body: any = null
): Promise<any> => {
    const proxyUrl = await getProxyUrl();
    const fullUrl = endpoint.startsWith('http')
        ? endpoint
        : `https://api.planningcenteronline.com/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}`;

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connection': 'close'
            },
            body: JSON.stringify({ churchId, url: fullUrl, method, body })
        });

        console.log(`[SyncService] Fetching ${method} ${fullUrl} for church ${churchId}`);

        if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            let waitTime = 2000 * Math.pow(2, retryCount);
            if (retryAfterHeader) {
                const seconds = parseInt(retryAfterHeader, 10);
                if (!isNaN(seconds)) waitTime = (seconds * 1000) + 100;
            }
            waitTime += Math.random() * 500;

            if (retryCount < 5) {
                logger.warn(`PCO Rate Limit 429 — retrying`, 'sync', { endpoint, retryCount, waitTimeMs: Math.round(waitTime) }, churchId);
                await delay(waitTime);
                // Preserve method/body — a rate-limited POST must not retry as a GET.
                return pcoFetch(churchId, endpoint, retryCount + 1, method, body);
            } else {
                logger.error('PCO API Rate Limit Exceeded: Max retries reached', 'sync', { endpoint }, churchId);
                throw new Error('PCO API Rate Limit Exceeded: Max retries reached.');
            }
        }

        if (response.status === 404) {
            logger.warn(`PCO API Resource Not Found (404)`, 'sync', { endpoint }, churchId);
            return null;
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`PCO API Error (${response.status}): ${errText}`);
        }

        return await response.json();
    } catch (e: any) {
        throw e;
    }
};

export interface FetchAllPagesOptions {
    /**
     * Throw instead of silently returning a partial result when a page fetch
     * fails or pagination hits the safety limit.
     *
     * The default (false) is the historic behaviour: log a warning, stop
     * paginating, and return whatever was collected so far. That is fine for
     * best-effort data, but dangerous for anything used as a lookup table —
     * an empty map silently turns into wrong values written over good ones.
     * Use `strict: true` whenever a truncated result would corrupt data
     * rather than merely leave it stale.
     */
    strict?: boolean;
}

export const fetchAllPages = async (
    churchId: string,
    endpoint: string,
    mapFn: (item: any, included?: any[]) => any,
    limitPerPage = 100,
    options: FetchAllPagesOptions = {}
) => {
    let allItems: any[] = [];
    let nextUrl = `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${limitPerPage}`;
    let pageCount = 0;
    const SAFETY_MAX_PAGES = 500;

    while (nextUrl && pageCount < SAFETY_MAX_PAGES) {
        const relativeUrl = nextUrl;
        try {
            const data = await pcoFetch(churchId, relativeUrl);
            if (data && data.data) {
                const mapped = data.data.map((item: any) => mapFn(item, data.included));
                allItems = [...allItems, ...mapped.flat()];
            }
            nextUrl = data?.links?.next;
            pageCount++;
            await delay(200);
        } catch (e: any) {
            if (options.strict) {
                throw new Error(
                    `PCO fetch failed on page ${pageCount} of ${endpoint}: ${e?.message || e}`
                );
            }
            logger.warn(`Error fetching page ${pageCount}`, 'sync', { endpoint, page: pageCount, error: e?.message });
            nextUrl = null;
        }
    }

    if (pageCount >= SAFETY_MAX_PAGES) {
        if (options.strict) {
            throw new Error(
                `PCO pagination hit the ${SAFETY_MAX_PAGES}-page safety limit on ${endpoint} — result is truncated`
            );
        }
        logger.warn(`Sync hit safety page limit — data may be incomplete`, 'sync', { endpoint, pages: SAFETY_MAX_PAGES });
    }

    return allItems;
};
