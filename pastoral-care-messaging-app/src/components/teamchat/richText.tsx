/**
 * Lightweight, XSS-safe rich text for chat bubbles.
 * Builds React nodes (never innerHTML). Supports:
 *   **bold**, `> quote` lines, `- ` / `* ` / `• ` bullets, URLs,
 *   and highlighted @staff / #person mention tokens.
 */
import React from 'react';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function renderInline(text: string, tokenRe: RegExp | null, mine: boolean, keyBase: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    // 1) bold
    text.split(/(\*\*[^*]+\*\*)/g).forEach((seg, i) => {
        if (!seg) return;
        const key = `${keyBase}-b${i}`;
        if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
            out.push(<strong key={key} className="font-bold">{renderInline(seg.slice(2, -2), tokenRe, mine, key)}</strong>);
            return;
        }
        // 2) links
        seg.split(URL_RE).forEach((part, j) => {
            if (!part) return;
            const k2 = `${key}-u${j}`;
            if (/^https?:\/\//.test(part)) {
                out.push(
                    <a key={k2} href={part} target="_blank" rel="noopener noreferrer"
                        className={`underline break-all ${mine ? 'text-white' : 'text-violet-600 dark:text-violet-400'}`}>
                        {part}
                    </a>
                );
                return;
            }
            // 3) mention tokens
            if (!tokenRe) { out.push(<React.Fragment key={k2}>{part}</React.Fragment>); return; }
            part.split(tokenRe).forEach((t, m) => {
                if (!t) return;
                const k3 = `${k2}-m${m}`;
                if (m % 2 === 1) {
                    out.push(
                        <span key={k3} className={`font-semibold rounded px-0.5 ${mine ? 'bg-white/20' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'}`}>
                            {t}
                        </span>
                    );
                } else {
                    out.push(<React.Fragment key={k3}>{t}</React.Fragment>);
                }
            });
        });
    });
    return out;
}

export function renderRichText(text: string, opts: { mine?: boolean; tokens?: string[] } = {}): React.ReactNode {
    const { mine = false, tokens = [] } = opts;
    const uniq = Array.from(new Set(['@PastorAI', ...tokens].filter(Boolean))).sort((a, b) => b.length - a.length);
    const tokenRe = uniq.length ? new RegExp(`(${uniq.map(escapeRegExp).join('|')})`, 'gi') : null;

    const lines = text.split('\n');
    const blocks: React.ReactNode[] = [];
    let bullets: React.ReactNode[] = [];
    const flushBullets = () => {
        if (bullets.length) {
            blocks.push(<ul key={`ul${blocks.length}`} className="list-disc pl-5 my-1 space-y-0.5">{bullets}</ul>);
            bullets = [];
        }
    };

    lines.forEach((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
            bullets.push(<li key={`li${i}`}>{renderInline(bullet[1], tokenRe, mine, `l${i}`)}</li>);
            return;
        }
        flushBullets();
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
            blocks.push(
                <div key={`q${i}`} className={`border-l-2 pl-2 my-1 italic ${mine ? 'border-white/60 text-white/90' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}>
                    {renderInline(quote[1], tokenRe, mine, `q${i}`)}
                </div>
            );
            return;
        }
        if (!line.trim()) {
            blocks.push(<div key={`br${i}`} className="h-2" />);
            return;
        }
        blocks.push(<div key={`p${i}`}>{renderInline(line, tokenRe, mine, `p${i}`)}</div>);
    });
    flushBullets();
    return <>{blocks}</>;
}

