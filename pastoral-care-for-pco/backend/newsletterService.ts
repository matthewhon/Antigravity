import { getDb } from './firebase.js';
import { pcoRequest } from './pcoApi.js';
import { createServerLogger } from '../services/logService.js';
import { resolveEmailProvider } from './emailProvider.js';
import { renderBlocksToHtml } from './sendEmail.js';
import type { 
  NewsletterWidgetConfig, 
  NewsletterSubscriber, 
  NewsletterFieldConfig, 
  NewsletterActionConfig 
} from '../types.js';

// Default starter widget configuration for any church
export function getDefaultWidgetConfig(churchId: string, churchName?: string): NewsletterWidgetConfig {
  const name = churchName || 'Church';
  return {
    id: `widget_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    churchId,
    name: 'Website Newsletter Signup',
    displayType: 'both',
    theme: {
      primaryColor: '#4F46E5',
      backgroundColor: '#FFFFFF',
      textColor: '#1E293B',
      borderRadius: 12,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      headline: `Stay Connected with ${name}`,
      description: 'Subscribe to receive our latest updates, announcements, and weekly devotionals.',
      buttonText: 'Subscribe',
      successMessage: 'Thank you for subscribing! Check your inbox for updates.',
    },
    bubbleConfig: {
      enabled: true,
      buttonText: '💌 Subscribe',
      buttonIcon: '💌',
      position: 'right',
      triggerMode: 'button_only',
      delaySeconds: 5,
      scrollPercent: 40
    },
    fields: [
      {
        id: 'email',
        label: 'Email Address',
        type: 'email',
        required: true,
        placeholder: 'you@example.com',
        mapToPco: 'email'
      },
      {
        id: 'firstName',
        label: 'First Name',
        type: 'text',
        required: false,
        placeholder: 'First Name',
        mapToPco: 'firstName'
      },
      {
        id: 'lastName',
        label: 'Last Name',
        type: 'text',
        required: false,
        placeholder: 'Last Name',
        mapToPco: 'lastName'
      },
      {
        id: 'phone',
        label: 'Mobile Phone',
        type: 'phone',
        required: false,
        placeholder: '(555) 000-0000',
        mapToPco: 'phone'
      }
    ],
    actions: {
      syncToPco: true,
      sendWelcomeEmail: false,
      notifyStaff: false
    },
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ─── 1. List Widgets (Admin) ─────────────────────────────────────────────────
export async function listNewsletterWidgets(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const snap = await db.collection('newsletter_widgets')
      .where('churchId', '==', churchId)
      .get();

    let widgets = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // If no widget exists yet, auto-create a default one
    if (widgets.length === 0) {
      const churchDoc = await db.collection('churches').doc(churchId).get();
      const churchName = churchDoc.exists ? churchDoc.data()?.name : 'Our Church';
      const defaultWidget = getDefaultWidgetConfig(churchId, churchName);
      await db.collection('newsletter_widgets').doc(defaultWidget.id).set(defaultWidget);
      widgets = [defaultWidget];
    }

    res.json(widgets);
  } catch (e: any) {
    console.error('[Newsletter] listNewsletterWidgets error:', e);
    res.status(500).json({ error: e.message || 'Failed to list newsletter widgets' });
  }
}

// ─── 2. Save Widget (Admin) ──────────────────────────────────────────────────
export async function saveNewsletterWidget(req: any, res: any) {
  const { churchId } = req.params;
  const widgetData = req.body;
  try {
    const db = getDb();
    const widgetId = widgetData.id || `widget_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const docData: NewsletterWidgetConfig = {
      ...widgetData,
      id: widgetId,
      churchId,
      updatedAt: Date.now(),
      createdAt: widgetData.createdAt || Date.now()
    };

    await db.collection('newsletter_widgets').doc(widgetId).set(docData, { merge: true });
    res.json({ success: true, widget: docData });
  } catch (e: any) {
    console.error('[Newsletter] saveNewsletterWidget error:', e);
    res.status(500).json({ error: e.message || 'Failed to save newsletter widget' });
  }
}

// ─── 3. Delete Widget (Admin) ────────────────────────────────────────────────
export async function deleteNewsletterWidget(req: any, res: any) {
  const { churchId, widgetId } = req.params;
  try {
    const db = getDb();
    const docRef = db.collection('newsletter_widgets').doc(widgetId);
    const snap = await docRef.get();

    if (!snap.exists || snap.data()?.churchId !== churchId) {
      return res.status(404).json({ error: 'Newsletter widget not found' });
    }

    await docRef.delete();
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Newsletter] deleteNewsletterWidget error:', e);
    res.status(500).json({ error: e.message || 'Failed to delete newsletter widget' });
  }
}

// ─── 4. Get Public Widget Config (Public) ────────────────────────────────────
export async function getPublicNewsletterWidget(req: any, res: any) {
  const { churchId, widgetId } = req.params;
  try {
    const db = getDb();

    let widget: NewsletterWidgetConfig | null = null;

    if (widgetId && widgetId !== 'default') {
      const snap = await db.collection('newsletter_widgets').doc(widgetId).get();
      if (snap.exists && snap.data()?.churchId === churchId && snap.data()?.isActive !== false) {
        widget = { id: snap.id, ...snap.data() } as NewsletterWidgetConfig;
      }
    }

    if (!widget) {
      // Find the first active widget for this church
      const snap = await db.collection('newsletter_widgets')
        .where('churchId', '==', churchId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!snap.empty) {
        widget = { id: snap.docs[0].id, ...snap.docs[0].data() } as NewsletterWidgetConfig;
      }
    }

    // Fetch church logo & name if available
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchData = churchDoc.exists ? churchDoc.data() : null;

    if (!widget) {
      // Provide default fallback config
      widget = getDefaultWidgetConfig(churchId, churchData?.name);
    }

    res.json({
      ...widget,
      churchName: churchData?.name || 'Church',
      churchLogoUrl: churchData?.logoUrl || null
    });
  } catch (e: any) {
    console.error('[Newsletter] getPublicNewsletterWidget error:', e);
    res.status(500).json({ error: e.message || 'Failed to load newsletter widget' });
  }
}

// ─── 5. Subscribe to Newsletter with PCO Matching & Actions ──────────────────
export async function subscribeNewsletter(req: any, res: any) {
  const { churchId } = req.params;
  const { 
    widgetId,
    email, 
    firstName, 
    lastName, 
    phone, 
    honeypot, 
    source = 'widget',
    ...customValues 
  } = req.body || {};

  // Silent reject for bot submissions
  if (honeypot) {
    return res.json({ success: true, message: 'Subscribed successfully.' });
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPhone = (phone || '').trim();
  const digitsOnlyPhone = cleanPhone.replace(/\D/g, '');
  const cleanFirstName = (firstName || '').trim();
  const cleanLastName = (lastName || '').trim();
  const cleanFullName = [cleanFirstName, cleanLastName].filter(Boolean).join(' ') || (cleanFirstName || cleanEmail.split('@')[0]);

  const db = getDb();
  const log = createServerLogger(db);
  const subscriberDocId = `${churchId}_${Buffer.from(cleanEmail).toString('base64url')}`;

  try {
    // 1. Fetch widget config (or default)
    let widgetConfig: NewsletterWidgetConfig | null = null;
    if (widgetId) {
      const wSnap = await db.collection('newsletter_widgets').doc(widgetId).get();
      if (wSnap.exists && wSnap.data()?.churchId === churchId) {
        widgetConfig = { id: wSnap.id, ...wSnap.data() } as NewsletterWidgetConfig;
      }
    }
    if (!widgetConfig) {
      const snap = await db.collection('newsletter_widgets')
        .where('churchId', '==', churchId)
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (!snap.empty) {
        widgetConfig = { id: snap.docs[0].id, ...snap.docs[0].data() } as NewsletterWidgetConfig;
      } else {
        widgetConfig = getDefaultWidgetConfig(churchId);
      }
    }

    const actions = widgetConfig.actions || { syncToPco: true, sendWelcomeEmail: false, notifyStaff: false };
    const fields = widgetConfig.fields || [];

    // Track execution statuses
    const actionsExecuted: {
      pcoSynced: boolean;
      workflowEnrolled?: boolean;
      welcomeEmailSent?: boolean;
      staffNotified?: boolean;
      error?: string | null;
    } = { pcoSynced: false };

    let matchedPersonId: string | null = null;
    let isNewPcoPerson = false;

    // ─── 2. Planning Center Matching & Deduplication ──────────────────────────
    if (actions.syncToPco !== false) {
      try {
        // Step A: Search PCO by Email
        const emailQuery = `https://api.planningcenteronline.com/people/v2/emails?where[address]=${encodeURIComponent(cleanEmail)}`;
        const emailSearchRes = await pcoRequest(churchId, emailQuery, 'GET');
        if (emailSearchRes?.data && emailSearchRes.data.length > 0) {
          matchedPersonId = emailSearchRes.data[0].relationships?.person?.data?.id || null;
        }

        // Step B: Search PCO by Phone if not matched by email
        if (!matchedPersonId && digitsOnlyPhone) {
          const phoneQuery = `https://api.planningcenteronline.com/people/v2/phone_numbers?where[number]=${digitsOnlyPhone}`;
          const phoneSearchRes = await pcoRequest(churchId, phoneQuery, 'GET');
          if (phoneSearchRes?.data && phoneSearchRes.data.length > 0) {
            matchedPersonId = phoneSearchRes.data[0].relationships?.person?.data?.id || null;
          }
        }

        const personAttributes: Record<string, any> = {};
        if (cleanFirstName) personAttributes.first_name = cleanFirstName;
        if (cleanLastName) personAttributes.last_name = cleanLastName;

        // Map any core person attributes from custom fields
        fields.forEach(f => {
          const val = customValues[f.id];
          if (!val) return;
          if (f.mapToPco === 'birthday') personAttributes.birthdate = String(val);
        });

        // Step C: Link / Patch existing or Create new person
        if (matchedPersonId) {
          // Existing person found: Non-destructively patch missing attributes
          log.info(`[Newsletter] Found existing PCO person ${matchedPersonId} for ${cleanEmail}`, 'system', { personId: matchedPersonId }, churchId);
          if (Object.keys(personAttributes).length > 0) {
            await pcoRequest(
              churchId,
              `https://api.planningcenteronline.com/people/v2/people/${matchedPersonId}`,
              'PATCH',
              { data: { type: 'Person', id: matchedPersonId, attributes: personAttributes } }
            ).catch(err => log.warn(`[Newsletter] Patch person attributes warning: ${err.message}`, 'system', {}, churchId));
          }
        } else {
          // New person: Create record in PCO
          isNewPcoPerson = true;
          log.info(`[Newsletter] Creating new PCO person for ${cleanEmail}`, 'system', {}, churchId);
          const createRes = await pcoRequest(
            churchId,
            'https://api.planningcenteronline.com/people/v2/people',
            'POST',
            { data: { type: 'Person', attributes: personAttributes } }
          );
          matchedPersonId = createRes?.data?.id || null;
        }

        if (matchedPersonId) {
          // Attach email if not already present on profile
          const checkEmails = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${matchedPersonId}/emails`, 'GET').catch(() => null);
          const hasEmail = (checkEmails?.data || []).some((e: any) => (e.attributes?.address || '').toLowerCase() === cleanEmail);
          if (!hasEmail) {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${matchedPersonId}/emails`, 'POST', {
              data: {
                type: 'Email',
                attributes: { address: cleanEmail, location: 'Home' }
              }
            }).catch(err => log.warn(`[Newsletter] Add email warning: ${err.message}`, 'system', {}, churchId));
          }

          // Attach phone if provided and not present
          if (cleanPhone) {
            const checkPhones = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${matchedPersonId}/phone_numbers`, 'GET').catch(() => null);
            const hasPhone = (checkPhones?.data || []).some((p: any) => (p.attributes?.number || '').replace(/\D/g, '') === digitsOnlyPhone);
            if (!hasPhone) {
              await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${matchedPersonId}/phone_numbers`, 'POST', {
                data: {
                  type: 'PhoneNumber',
                  attributes: { number: cleanPhone, location: 'Mobile' }
                }
              }).catch(err => log.warn(`[Newsletter] Add phone warning: ${err.message}`, 'system', {}, churchId));
            }
          }

          // Step D: Write Custom Field Data if configured
          for (const f of fields) {
            const val = customValues[f.id];
            if (f.mapToPco === 'customField' && f.pcoCustomFieldId && val !== undefined && val !== null && val !== '') {
              const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
              await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/field_data`, 'POST', {
                data: {
                  type: 'FieldData',
                  attributes: { value: displayVal },
                  relationships: {
                    custom_field_definition: { data: { type: 'CustomFieldDefinition', id: f.pcoCustomFieldId } },
                    person: { data: { type: 'Person', id: matchedPersonId } }
                  }
                }
              }).catch(err => log.warn(`[Newsletter] Field data write warning: ${err.message}`, 'system', {}, churchId));
            }
          }

          // Step E: Set preset Custom Field Values from Action config
          if (actions.pcoCustomFieldValues && typeof actions.pcoCustomFieldValues === 'object') {
            for (const [defId, val] of Object.entries(actions.pcoCustomFieldValues)) {
              if (defId && val) {
                await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/field_data`, 'POST', {
                  data: {
                    type: 'FieldData',
                    attributes: { value: String(val) },
                    relationships: {
                      custom_field_definition: { data: { type: 'CustomFieldDefinition', id: defId } },
                      person: { data: { type: 'Person', id: matchedPersonId } }
                    }
                  }
                }).catch(err => log.warn(`[Newsletter] Preset field data write warning: ${err.message}`, 'system', {}, churchId));
              }
            }
          }

          // Step F: PCO Workflow Enrollment
          if (actions.pcoWorkflowId) {
            try {
              const workflowPayload: any = {
                data: {
                  type: 'Card',
                  relationships: {
                    person: { data: { type: 'Person', id: matchedPersonId } }
                  }
                }
              };
              if (actions.pcoWorkflowStepId) {
                workflowPayload.data.relationships.workflow_step = {
                  data: { type: 'WorkflowStep', id: actions.pcoWorkflowStepId }
                };
              }
              await pcoRequest(
                churchId,
                `https://api.planningcenteronline.com/people/v2/workflows/${actions.pcoWorkflowId}/cards`,
                'POST',
                workflowPayload
              );
              actionsExecuted.workflowEnrolled = true;
              log.info(`[Newsletter] Enrolled ${matchedPersonId} in workflow ${actions.pcoWorkflowId}`, 'system', {}, churchId);
            } catch (wfErr: any) {
              log.warn(`[Newsletter] Workflow enrollment warning: ${wfErr.message}`, 'system', {}, churchId);
            }
          }

          // Step G: PCO Group Assignment
          if (actions.pcoGroupId) {
            try {
              await pcoRequest(
                churchId,
                `https://api.planningcenteronline.com/groups/v2/groups/${actions.pcoGroupId}/memberships`,
                'POST',
                {
                  data: {
                    type: 'Membership',
                    relationships: {
                      person: { data: { type: 'Person', id: matchedPersonId } }
                    }
                  }
                }
              );
              log.info(`[Newsletter] Added ${matchedPersonId} to group ${actions.pcoGroupId}`, 'system', {}, churchId);
            } catch (grpErr: any) {
              log.warn(`[Newsletter] Group membership warning: ${grpErr.message}`, 'system', {}, churchId);
            }
          }

          // Step H: Write Profile Note
          try {
            const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const noteText = `📰 Subscribed to Newsletter (${widgetConfig.name || 'Website Widget'}) on ${dateStr}.\nEmail: ${cleanEmail}${cleanPhone ? ` | Phone: ${cleanPhone}` : ''}`;
            await pcoRequest(
              churchId,
              `https://api.planningcenteronline.com/people/v2/people/${matchedPersonId}/notes`,
              'POST',
              {
                data: {
                  type: 'Note',
                  attributes: { note: noteText }
                }
              }
            );
          } catch (noteErr: any) {
            // Note failure is non-fatal
          }

          actionsExecuted.pcoSynced = true;
        }
      } catch (pcoErr: any) {
        console.error('[Newsletter] PCO Sync Error:', pcoErr);
        actionsExecuted.error = pcoErr.message || 'PCO Sync encountered an issue';
      }
    }

    // ─── 3. Automated Welcome Email ──────────────────────────────────────────
    if (actions.sendWelcomeEmail) {
      try {
        const churchDoc = await db.collection('churches').doc(churchId).get();
        const churchData = churchDoc.exists ? churchDoc.data() : {};
        const emailSettings = churchData?.emailSettings || {};
        const fromEmail = emailSettings.fromEmail || 'updates@pastoralcare.barnabassoftware.com';
        const fromName = emailSettings.fromName || churchData?.name || 'Church Office';

        let subject = actions.welcomeEmailSubject || `Welcome to ${churchData?.name || 'our newsletter'}!`;
        let htmlBody = actions.welcomeEmailBody 
          ? `<p>${actions.welcomeEmailBody.replace(/\n/g, '<br/>')}</p>` 
          : `<p>Hi ${cleanFirstName || 'there'},</p><p>Thank you for subscribing to our updates! We're glad to have you connected with ${churchData?.name || 'us'}.</p>`;

        // If a campaign template was selected, render its blocks
        if (actions.welcomeEmailCampaignId) {
          const campDoc = await db.collection('email_campaigns').doc(actions.welcomeEmailCampaignId).get();
          if (campDoc.exists) {
            const camp = campDoc.data()!;
            subject = camp.subject || subject;
            htmlBody = renderBlocksToHtml(camp.blocks || [], camp.templateSettings, '', camp.contentType, camp.content);
          }
        }

        // Replace basic merge tags
        const personalizedSubject = subject
          .replace(/\{firstName\}/gi, cleanFirstName || 'Friend')
          .replace(/\{lastName\}/gi, cleanLastName || '')
          .replace(/\{churchName\}/gi, churchData?.name || 'our church');

        const personalizedHtml = htmlBody
          .replace(/\{firstName\}/gi, cleanFirstName || 'Friend')
          .replace(/\{lastName\}/gi, cleanLastName || '')
          .replace(/\{churchName\}/gi, churchData?.name || 'our church');

        const sysSettingsSnap = await db.doc('system/settings').get();
        const sysSettings = sysSettingsSnap.data() || {};
        const emailProviderName = sysSettings.emailProvider || 'sendgrid';
        const apiKey = emailProviderName === 'postmark' ? sysSettings.postmarkApiKey : sysSettings.sendGridApiKey;
        const subuserId = emailSettings.postmarkServerToken || emailSettings.sendGridSubuserId || undefined;

        if (apiKey) {
          const provider = await resolveEmailProvider(db);
          await provider.send(
            [{ to: cleanEmail, from: { email: fromEmail, name: fromName }, subject: personalizedSubject, html: personalizedHtml }],
            { apiKey, tenantToken: subuserId, tag: 'newsletter_welcome', stream: 'broadcast' }
          );
          actionsExecuted.welcomeEmailSent = true;
          log.info(`[Newsletter] Sent automated welcome email to ${cleanEmail}`, 'system', {}, churchId);
        }
      } catch (welcomeErr: any) {
        log.warn(`[Newsletter] Automated welcome email failed: ${welcomeErr.message}`, 'system', {}, churchId);
      }
    }

    // ─── 4. Staff Notification Alert ─────────────────────────────────────────
    if (actions.notifyStaff && Array.isArray(actions.staffNotificationEmails) && actions.staffNotificationEmails.length > 0) {
      try {
        const churchDoc = await db.collection('churches').doc(churchId).get();
        const churchData = churchDoc.exists ? churchDoc.data() : {};
        const churchName = churchData?.name || 'Church';

        const alertSubject = `🔔 New Newsletter Subscriber: ${cleanFullName}`;
        const alertHtml = `
          <div style="font-family:sans-serif;font-size:14px;color:#334155;line-height:1.6;max-width:550px;">
            <h2 style="color:#1e293b;margin-bottom:12px;">New Newsletter Subscription</h2>
            <p>A new subscriber just signed up on your website:</p>
            <ul style="background:#f8fafc;border:1px solid #e2e8f0;padding:16px 24px;border-radius:10px;">
              <li><strong>Name:</strong> ${cleanFullName}</li>
              <li><strong>Email:</strong> ${cleanEmail}</li>
              ${cleanPhone ? `<li><strong>Phone:</strong> ${cleanPhone}</li>` : ''}
              <li><strong>Widget:</strong> ${widgetConfig.name}</li>
              <li><strong>Planning Center:</strong> ${matchedPersonId ? `Linked to Person #${matchedPersonId} (${isNewPcoPerson ? 'New Profile Created' : 'Existing Profile Linked'})` : 'PCO Sync Off'}</li>
            </ul>
            <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Sent automatically by Pastoral Care for Planning Center.</p>
          </div>
        `;

        const sysSettingsSnap = await db.doc('system/settings').get();
        const sysSettings = sysSettingsSnap.data() || {};
        const emailProviderName = sysSettings.emailProvider || 'sendgrid';
        const apiKey = emailProviderName === 'postmark' ? sysSettings.postmarkApiKey : sysSettings.sendGridApiKey;

        if (apiKey) {
          const provider = await resolveEmailProvider(db);
          const messages = actions.staffNotificationEmails.map((staffEmail: string) => ({
            to: staffEmail.trim(),
            from: { email: 'notifications@pastoralcare.barnabassoftware.com', name: `${churchName} Notifications` },
            subject: alertSubject,
            html: alertHtml
          }));
          await provider.send(messages, { apiKey, tag: 'newsletter_staff_alert', stream: 'broadcast' });
          actionsExecuted.staffNotified = true;
        }
      } catch (staffErr: any) {
        log.warn(`[Newsletter] Staff notification alert failed: ${staffErr.message}`, 'system', {}, churchId);
      }
    }

    // ─── 5. Save Subscriber Record in Firestore ──────────────────────────────
    const subscriberRecord: NewsletterSubscriber = {
      id: subscriberDocId,
      churchId,
      widgetId: widgetConfig.id,
      widgetName: widgetConfig.name,
      email: cleanEmail,
      firstName: cleanFirstName || undefined,
      lastName: cleanLastName || undefined,
      name: cleanFullName,
      phone: cleanPhone || undefined,
      pcoPersonId: matchedPersonId || null,
      isNewPcoPerson,
      status: 'active',
      subscribedAt: Date.now(),
      submittedData: {
        ...customValues,
        source
      },
      actionsExecuted,
      source
    };

    await db.collection('newsletter_subscribers').doc(subscriberDocId).set(subscriberRecord, { merge: true });

    // ─── 6. Clear any previous unsubscribes for this email ───────────────────
    const unsubSnap = await db.collection('email_unsubscribes')
      .where('churchId', '==', churchId)
      .where('email', '==', cleanEmail)
      .get();

    if (!unsubSnap.empty) {
      const batch = db.batch();
      unsubSnap.docs.forEach((d: any) => batch.delete(d.ref));
      await batch.commit().catch(() => {});
    }

    res.json({
      success: true,
      message: widgetConfig.theme?.successMessage || 'Thank you for subscribing!',
      redirectUrl: widgetConfig.theme?.redirectUrl || null,
      subscriber: subscriberRecord
    });
  } catch (e: any) {
    console.error('[Newsletter] Subscribe Error:', e);
    res.status(500).json({ error: e.message || 'Failed to process subscription' });
  }
}

// ─── 6. List Subscribers (Admin) ─────────────────────────────────────────────
export async function listNewsletterSubscribers(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const snap = await db.collection('newsletter_subscribers')
      .where('churchId', '==', churchId)
      .orderBy('subscribedAt', 'desc')
      .limit(500)
      .get();

    const subscribers = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    res.json(subscribers);
  } catch (e: any) {
    console.error('[Newsletter] listNewsletterSubscribers error:', e);
    res.status(500).json({ error: e.message || 'Failed to list subscribers' });
  }
}

// ─── 7. Update Subscriber Status (Admin) ─────────────────────────────────────
export async function updateNewsletterSubscriberStatus(req: any, res: any) {
  const { churchId, subscriberId } = req.params;
  const { status } = req.body;
  if (!['active', 'unsubscribed'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or unsubscribed' });
  }

  try {
    const db = getDb();
    const docRef = db.collection('newsletter_subscribers').doc(subscriberId);
    const snap = await docRef.get();

    if (!snap.exists || snap.data()?.churchId !== churchId) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const updates: Partial<NewsletterSubscriber> = {
      status,
      unsubscribedAt: status === 'unsubscribed' ? Date.now() : null
    };

    await docRef.update(updates);
    res.json({ success: true, status });
  } catch (e: any) {
    console.error('[Newsletter] updateNewsletterSubscriberStatus error:', e);
    res.status(500).json({ error: e.message || 'Failed to update subscriber' });
  }
}

// ─── 8. Delete Subscriber (Admin) ────────────────────────────────────────────
export async function deleteNewsletterSubscriber(req: any, res: any) {
  const { churchId, subscriberId } = req.params;
  try {
    const db = getDb();
    const docRef = db.collection('newsletter_subscribers').doc(subscriberId);
    const snap = await docRef.get();

    if (!snap.exists || snap.data()?.churchId !== churchId) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    await docRef.delete();
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Newsletter] deleteNewsletterSubscriber error:', e);
    res.status(500).json({ error: e.message || 'Failed to delete subscriber' });
  }
}
