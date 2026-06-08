// ─── Email Provider Abstraction Layer ────────────────────────────────────────
//
// This module defines the common EmailProvider interface and the router function
// resolveEmailProvider() that reads system/settings.emailProvider from Firestore
// and returns the appropriate provider implementation.
//
// To switch providers, set system/settings.emailProvider to 'sendgrid' or
// 'postmark' — no code deploy required. The switch is live and reversible.

import { SendGridProvider } from './sgProvider.js';
import { PostmarkProvider } from './pmProvider.js';

// ─── Shared types ────────────────────────────────────────────────────────────

export interface EmailMessage {
    to: string;
    from: { email: string; name?: string };
    replyTo?: string;
    subject: string;
    html: string;
}

export interface SendOptions {
    /** Master / account-level API key. For SendGrid this is the master key;
     *  for Postmark this is the Account API token used for provisioning only. */
    apiKey: string;
    /** Per-church isolation token.
     *  SendGrid: sendGridSubuserId (used as the on-behalf-of header)
     *  Postmark:  postmarkServerToken (used as X-Postmark-Server-Token header) */
    tenantToken?: string;
    /** Campaign ID used for analytics tagging (SendGrid categories / Postmark tag). */
    tag?: string;
    /** Stream type hint.
     *  'transactional' → reliable inbox delivery (receipts, notifications)
     *  'broadcast'     → bulk/campaign emails
     *  SendGrid ignores this (same API for both); Postmark routes to the correct message stream. */
    stream?: 'transactional' | 'broadcast';
}

export interface DnsRecord {
    host: string;
    type: 'CNAME' | 'TXT';
    data: string;
    /** Label shown to the admin e.g. "DKIM", "Return-Path", "Mail CNAME" */
    label?: string;
}

export interface DiagnosticCheck {
    label: string;
    status: 'pass' | 'fail' | 'warn';
    detail: string;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface EmailProvider {
    /** Send one or more email messages. */
    send(messages: EmailMessage[], options: SendOptions): Promise<void>;

    /** Provision a new sending identity for a church tenant.
     *  SendGrid: creates a Subuser and associates the shared domain.
     *  Postmark:  creates a Server and stores its API token in Firestore. */
    provisionTenant(db: any, churchId: string, prefix: string, fromName: string): Promise<{ fromEmail: string; tenantToken: string }>;

    /** Initiate custom domain authentication and return the DNS records to add.
     *  SendGrid: returns 3 CNAME records.
     *  Postmark:  returns 2 records (DKIM TXT + Return-Path CNAME). */
    authenticateDomain(db: any, churchId: string, domain: string, fromEmail?: string, fromName?: string): Promise<DnsRecord[]>;

    /** Verify that DNS records have propagated. Updates Firestore on success. */
    verifyDomain(db: any, churchId: string): Promise<{ verified: boolean; message: string; dnsRecords?: DnsRecord[] }>;

    /** Run a full diagnostic check and optionally send a test email. */
    diagnoseDomain(db: any, churchId: string, testEmailAddress: string): Promise<{ success: boolean; checks: DiagnosticCheck[] }>;
}

// ─── Provider router ─────────────────────────────────────────────────────────

/**
 * Reads system/settings.emailProvider from Firestore and returns the matching
 * EmailProvider implementation. Defaults to 'sendgrid' if not set — meaning
 * no existing behaviour changes until you explicitly flip the flag.
 *
 * Usage:
 *   const provider = await resolveEmailProvider(db);
 *   await provider.send(messages, options);
 */
export async function resolveEmailProvider(db: any): Promise<EmailProvider> {
    const snap = await db.doc('system/settings').get();
    const providerName: string = snap.data()?.emailProvider || 'sendgrid';

    if (providerName === 'postmark') {
        return new PostmarkProvider();
    }
    return new SendGridProvider();
}
