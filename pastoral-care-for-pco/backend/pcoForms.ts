import { getDb } from './firebase.js';
import type { DocumentData } from 'firebase-admin/firestore';
import { createServerLogger } from '../services/logService.js';

// Helper to make authenticated/refreshed PCO requests
async function pcoRequest(
  churchId: string,
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any
): Promise<any> {
  const db = getDb();
  const churchDoc = await db.collection('churches').doc(churchId).get();
  if (!churchDoc.exists) throw new Error('Church not found');
  const churchData = churchDoc.data();
  let accessToken = churchData?.pcoAccessToken;
  const refreshToken = churchData?.pcoRefreshToken;

  if (!accessToken) throw new Error('No PCO access token');

  const performReq = async (token: string) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PastoralCareApp/1.0'
    };
    const options: RequestInit = { method, headers };
    if (body && (method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }
    return fetch(url, options);
  };

  let response = await performReq(accessToken);

  if (response.status === 401 && refreshToken) {
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};
    const clientId = (settings.pcoClientId || '').trim();
    const clientSecret = (settings.pcoClientSecret || '').trim();
    
    if (clientId && clientSecret) {
      const refreshParams = new URLSearchParams();
      refreshParams.append('grant_type', 'refresh_token');
      refreshParams.append('refresh_token', refreshToken);
      refreshParams.append('client_id', clientId);
      refreshParams.append('client_secret', clientSecret);
      
      const refreshRes = await fetch('https://api.planningcenteronline.com/oauth/token', {
        method: 'POST',
        body: refreshParams
      });
      
      if (refreshRes.ok) {
        const tokenData = await refreshRes.json();
        accessToken = tokenData.access_token;
        await db.collection('churches').doc(churchId).update({
          pcoAccessToken: accessToken,
          pcoRefreshToken: tokenData.refresh_token,
          pcoTokenExpiry: Date.now() + (tokenData.expires_in * 1000)
        });
        response = await performReq(accessToken);
      }
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`PCO API error: ${response.status} - ${errText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// 1. GET /api/forms/:churchId
export async function listForms(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const snapshot = await db.collection('pco_forms')
      .where('churchId', '==', churchId)
      .get();
    
    const forms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(forms);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

// 2. POST /api/forms/:churchId
export async function saveForm(req: any, res: any) {
  const { churchId } = req.params;
  const formData = req.body;
  try {
    const db = getDb();
    const formId = formData.id || `form_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const docData = {
      ...formData,
      id: formId,
      churchId,
      updatedAt: Date.now(),
      createdAt: formData.createdAt || Date.now()
    };

    await db.collection('pco_forms').doc(formId).set(docData, { merge: true });
    res.json({ success: true, form: docData });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

// 3. DELETE /api/forms/:churchId/:formId
export async function deleteForm(req: any, res: any) {
  const { churchId, formId } = req.params;
  try {
    const db = getDb();
    const docRef = db.collection('pco_forms').doc(formId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists || docSnap.data()?.churchId !== churchId) {
      return res.status(404).json({ error: 'Form not found' });
    }

    await docRef.delete();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

// 4. GET /api/public/form/:churchId/:formId
export async function getPublicForm(req: any, res: any) {
  const { churchId, formId } = req.params;
  try {
    const db = getDb();
    
    // Check if this is an Info Update session link
    if (formId.startsWith('ius_')) {
      const sessionSnap = await db.collection('people_info_sessions').doc(formId).get();
      if (!sessionSnap.exists || sessionSnap.data()?.churchId !== churchId) {
        return res.status(404).json({ error: 'Session not found or inactive' });
      }
      
      const session = sessionSnap.data()!;
      const campaignSnap = await db.collection('people_info_campaigns').doc(session.campaignId).get();
      if (!campaignSnap.exists) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      const campaign = campaignSnap.data()!;
      
      // Synthesize custom fields from campaign.fieldsToCollect
      const customFields: any[] = [];
      const requestedKeys = (campaign.fieldsToCollect || []).map((f: any) => f.key);
      
      if (!requestedKeys.includes('first_name')) {
          customFields.push({ id: 'first_name', type: 'text', label: 'First Name', required: true, mapToPco: 'firstName', defaultValue: session.existingPcoData?.first_name || '' });
      }
      if (!requestedKeys.includes('last_name')) {
          customFields.push({ id: 'last_name', type: 'text', label: 'Last Name', required: true, mapToPco: 'lastName', defaultValue: session.existingPcoData?.last_name || '' });
      }

      (campaign.fieldsToCollect || []).forEach((f: any) => {
        if (f.key === 'address_home') {
          customFields.push({ id: 'heading_address', type: 'section_heading', label: 'Home Address', required: false, mapToPco: 'none' });
          customFields.push({ id: 'street', type: 'text', label: 'Street Address', mapToPco: 'street', defaultValue: session.existingPcoData?.street || '' });
          customFields.push({ id: 'city', type: 'text', label: 'City', mapToPco: 'city', defaultValue: session.existingPcoData?.city || '' });
          customFields.push({ id: 'state', type: 'text', label: 'State', mapToPco: 'state', defaultValue: session.existingPcoData?.state || '' });
          customFields.push({ id: 'zip', type: 'text', label: 'ZIP Code', mapToPco: 'zip', defaultValue: session.existingPcoData?.zip || '' });
        } else {
          let type = 'text';
          let options: string[] | undefined;
          let mapToPco = f.key;
          
          if (f.key === 'phone_mobile') mapToPco = 'phone';
          else if (f.key === 'phone_home') mapToPco = 'phone';
          else if (f.key === 'email_primary') mapToPco = 'email';
          else if (f.key === 'birthdate') { type = 'date'; mapToPco = 'birthday'; }
          else if (f.key === 'anniversary') { type = 'date'; mapToPco = 'anniversary'; }
          else if (f.key === 'gender') { type = 'select'; options = ['Male', 'Female']; mapToPco = 'gender'; }
          else if (f.key === 'marital_status') { type = 'select'; options = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated']; mapToPco = 'maritalStatus'; }
          else if (f.key === 'emergency_contact' || f.key === 'school' || f.key === 'membership' || f.key === 'graduation_year') {
             type = f.key === 'emergency_contact' ? 'paragraph' : 'text';
             mapToPco = 'notes';
          }
          
          customFields.push({
            id: f.key,
            type,
            label: f.label,
            required: false,
            options,
            mapToPco,
            defaultValue: session.existingPcoData?.[f.key] || ''
          });
        }
      });

      let churchLogoUrl = null;
      try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (churchSnap.exists) {
          churchLogoUrl = churchSnap.data()?.logoUrl || null;
        }
      } catch (err) {}

      return res.json({
        id: formId,
        churchId,
        name: `Update Info for ${session.personName}`,
        description: `Please take a moment to confirm or update your details.`,
        customFields,
        churchLogoUrl,
        styles: {
          primaryColor: '#059669', // emerald-600 to match Church Helper
          backgroundColor: '#FFFFFF',
          textColor: '#1F2937',
          buttonTextColor: '#FFFFFF'
        }
      });
    }

    const docSnap = await db.collection('pco_forms').doc(formId).get();
    
    if (!docSnap.exists || docSnap.data()?.churchId !== churchId || !docSnap.data()?.isActive) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    const data = docSnap.data()!;
    
    // Fetch default church logo if needed
    let churchLogoUrl = null;
    try {
      const churchSnap = await db.collection('churches').doc(churchId).get();
      if (churchSnap.exists) {
        churchLogoUrl = churchSnap.data()?.logoUrl || null;
      }
    } catch (err) {
      console.error("Failed to fetch church logo in getPublicForm:", err);
    }

    // Return a safe subset for public view
    res.json({
      id: data.id,
      churchId: data.churchId,
      name: data.name,
      description: data.description || null,
      customFields: data.customFields || null,
      fields: data.fields,
      churchLogoUrl,
      styles: data.styles || {
        primaryColor: '#4F46E5',
        backgroundColor: '#FFFFFF',
        textColor: '#1F2937',
        buttonTextColor: '#FFFFFF'
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

// 5. POST /api/public/form/:churchId/:formId/submit
export async function submitForm(req: any, res: any) {
  const { churchId, formId } = req.params;
  const submissionsData = req.body; // e.g. { firstName, lastName, email, phone, street, city, state, zip, birthday, gender }
  
  const db = getDb();
  const log = createServerLogger(db);
  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  try {
    // 1. Fetch form config
    let formConfig: any = {};
    if (formId.startsWith('ius_')) {
      const sessionSnap = await db.collection('people_info_sessions').doc(formId).get();
      if (!sessionSnap.exists || sessionSnap.data()?.churchId !== churchId) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      const session = sessionSnap.data()!;
      const campaignSnap = await db.collection('people_info_campaigns').doc(session.campaignId).get();
      if (!campaignSnap.exists) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      const campaign = campaignSnap.data()!;
      
      const customFields: any[] = [];
      (campaign.fieldsToCollect || []).forEach((f: any) => {
        if (f.key === 'address_home') {
          customFields.push({ id: 'heading_address', type: 'section_heading', label: 'Home Address', required: false, mapToPco: 'none' });
          customFields.push({ id: 'street', type: 'text', label: 'Street Address', mapToPco: 'street' });
          customFields.push({ id: 'city', type: 'text', label: 'City', mapToPco: 'city' });
          customFields.push({ id: 'state', type: 'text', label: 'State', mapToPco: 'state' });
          customFields.push({ id: 'zip', type: 'text', label: 'ZIP Code', mapToPco: 'zip' });
        } else {
          let type = 'text';
          let options: string[] | undefined;
          let mapToPco = f.key;
          
          if (f.key === 'phone_mobile' || f.key === 'phone_home') mapToPco = 'phone';
          else if (f.key === 'email_primary') mapToPco = 'email';
          else if (f.key === 'birthdate') { type = 'date'; mapToPco = 'birthday'; }
          else if (f.key === 'anniversary') { type = 'date'; mapToPco = 'anniversary'; }
          else if (f.key === 'gender') { type = 'select'; options = ['Male', 'Female']; mapToPco = 'gender'; }
          else if (f.key === 'marital_status') { type = 'select'; options = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated']; mapToPco = 'maritalStatus'; }
          else if (f.key === 'emergency_contact' || f.key === 'school' || f.key === 'membership' || f.key === 'graduation_year') {
             type = f.key === 'emergency_contact' ? 'paragraph' : 'text';
             mapToPco = 'notes';
          }
          
          customFields.push({
            id: f.key,
            type,
            label: f.label,
            required: false,
            options,
            mapToPco
          });
        }
      });
      
      formConfig = {
        name: `Info Update: ${session.personName}`,
        customFields,
        settings: { syncToPco: true },
        actions: {},
        forcedPersonId: session.pcoPersonId
      };
    } else {
      const formDoc = await db.collection('pco_forms').doc(formId).get();
      if (!formDoc.exists || formDoc.data()?.churchId !== churchId) {
        return res.status(404).json({ error: 'Form not found' });
      }
      formConfig = formDoc.data()!;
    }

    // Save initial submission record as pending
    await db.collection('pco_form_submissions').doc(submissionId).set({
      id: submissionId,
      formId,
      churchId,
      submittedAt: Date.now(),
      data: submissionsData,
      status: 'pending'
    });

    // Check if PCO syncing is bypassed (database-only form)
    if (formConfig.settings?.syncToPco === false) {
      log.info(`Database-only form submission received for form ${formId}. Bypassing PCO sync.`, 'forms', { formId }, churchId);
      await db.collection('pco_form_submissions').doc(submissionId).update({
        status: 'success'
      });
      return res.json({ success: true, dbOnly: true });
    }

    // 2. Search PCO to find matching person (by email first, then phone)
    let customFields = formConfig.customFields || [];
    if (customFields.length === 0 && formConfig.fields) {
      // Legacy fields migration in-memory
      Object.entries(formConfig.fields).forEach(([key, f]: any) => {
        if (f.enabled) {
          customFields.push({
            id: key,
            type: key === 'interests' ? 'checkboxes' : key === 'firstTimeVisitor' ? 'checkbox_single' : key === 'medicalNotes' || key === 'notes' ? 'paragraph' : 'text',
            label: f.customLabel || f.label,
            required: !!f.required,
            mapToPco: key,
            options: key === 'interests' ? ['Connect Group', 'Serving / Volunteer', 'Baptism', 'Membership', 'Child Dedication', 'Other'] : undefined
          });
        }
      });
    }

    let firstName = '';
    let lastName = '';
    let email = '';
    let phone = '';
    let middleName = '';
    let nickname = '';
    let gender = '';
    let birthday = '';
    let anniversary = '';
    let maritalStatus = '';
    let medicalNotes = '';
    let grade = '';
    let street = '';
    let city = '';
    let state = '';
    let zip = '';
    
    const noteLines: string[] = [];
    let generalNotes = '';

    customFields.forEach((field: any) => {
      const val = submissionsData[field.id];
      if (val === undefined || val === null || val === '') return;

      const displayVal = Array.isArray(val) ? val.join(', ') : (typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val));

      if (field.mapToPco === 'firstName') firstName = String(val).trim();
      else if (field.mapToPco === 'lastName') lastName = String(val).trim();
      else if (field.mapToPco === 'email') email = String(val).trim();
      else if (field.mapToPco === 'phone') phone = String(val).trim();
      else if (field.mapToPco === 'middleName') middleName = String(val).trim();
      else if (field.mapToPco === 'nickname') nickname = String(val).trim();
      else if (field.mapToPco === 'gender') gender = String(val).trim();
      else if (field.mapToPco === 'birthday') birthday = String(val).trim();
      else if (field.mapToPco === 'anniversary') anniversary = String(val).trim();
      else if (field.mapToPco === 'maritalStatus') maritalStatus = String(val).trim();
      else if (field.mapToPco === 'medicalNotes') medicalNotes = String(val).trim();
      else if (field.mapToPco === 'grade') grade = String(val).trim();
      else if (field.mapToPco === 'street') street = String(val).trim();
      else if (field.mapToPco === 'city') city = String(val).trim();
      else if (field.mapToPco === 'state') state = String(val).trim();
      else if (field.mapToPco === 'zip') zip = String(val).trim();
      else if (field.mapToPco === 'notes') {
        generalNotes = String(val).trim();
      } else {
        if (field.type !== 'section_heading' && field.type !== 'text_block') {
          noteLines.push(`• ${field.label}: ${displayVal}`);
        }
      }
    });

    let matchedPersonId: string | null = formConfig.forcedPersonId || null;

    if (!matchedPersonId && email) {
      const emailQuery = `https://api.planningcenteronline.com/people/v2/emails?where[address]=${encodeURIComponent(email)}`;
      const searchRes = await pcoRequest(churchId, emailQuery, 'GET');
      if (searchRes.data && searchRes.data.length > 0) {
        matchedPersonId = searchRes.data[0].relationships?.person?.data?.id || null;
      }
    }

    if (!matchedPersonId && phone) {
      const digitsOnly = phone.replace(/\D/g, '');
      const phoneQuery = `https://api.planningcenteronline.com/people/v2/phone_numbers?where[number]=${digitsOnly}`;
      const searchRes = await pcoRequest(churchId, phoneQuery, 'GET');
      if (searchRes.data && searchRes.data.length > 0) {
        matchedPersonId = searchRes.data[0].relationships?.person?.data?.id || null;
      }
    }

    let isNewPerson = false;
    let personId = matchedPersonId;

    const personAttributes: any = {};
    if (firstName) personAttributes.first_name = firstName;
    if (lastName) personAttributes.last_name = lastName;
    if (middleName) personAttributes.middle_name = middleName;
    if (nickname) personAttributes.nickname = nickname;
    if (gender) personAttributes.gender = gender;
    if (birthday) personAttributes.birthdate = birthday;
    if (anniversary) personAttributes.anniversary = anniversary;
    if (medicalNotes) personAttributes.medical_notes = medicalNotes;
    if (grade !== undefined && grade !== null && grade !== '') {
      personAttributes.grade = parseInt(grade, 10);
    }

    if (personId) {
      log.info(`Matching PCO user found: ${personId}. Overwriting profile.`, 'forms', { personId }, churchId);
      await pcoRequest(
        churchId,
        `https://api.planningcenteronline.com/people/v2/people/${personId}`,
        'PATCH',
        { data: { type: 'Person', id: personId, attributes: personAttributes } }
      );
    } else {
      isNewPerson = true;
      log.info(`No matching PCO user found. Creating new profile.`, 'forms', {}, churchId);
      const createRes = await pcoRequest(
        churchId,
        'https://api.planningcenteronline.com/people/v2/people',
        'POST',
        { data: { type: 'Person', attributes: personAttributes } }
      );
      personId = createRes.data?.id;
      if (!personId) throw new Error('Failed to create person in PCO');
    }

    if (email && personId) {
      const checkEmails = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`, 'GET');
      const existingEmail = checkEmails.data?.find((e: any) => e.attributes?.address?.toLowerCase() === email.toLowerCase());
      
      if (!existingEmail) {
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`, 'POST', {
          data: {
            type: 'Email',
            attributes: { address: email, location: 'Home' }
          }
        });
      }
    }

    if (phone && personId) {
      const checkPhones = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`, 'GET');
      const normalizedNewPhone = phone.replace(/\D/g, '');
      const existingPhone = checkPhones.data?.find((p: any) => (p.attributes?.number || '').replace(/\D/g, '') === normalizedNewPhone);

      if (!existingPhone) {
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`, 'POST', {
          data: {
            type: 'PhoneNumber',
            attributes: { number: phone, location: 'Mobile' }
          }
        });
      }
    }

    if ((street || city || state || zip) && personId) {
      const checkAddresses = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/addresses`, 'GET');
      const existingAddress = checkAddresses.data?.find((a: any) => a.attributes?.location === 'Home' || a.attributes?.primary);

      const addressPayload = {
        data: {
          type: 'Address',
          attributes: {
            street_line_1: street || '',
            city: city || '',
            state: state || '',
            zip: zip || '',
            location: 'Home',
            primary: true
          }
        }
      };

      if (existingAddress) {
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/addresses/${existingAddress.id}`, 'PATCH', addressPayload);
      } else {
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/addresses`, 'POST', addressPayload);
      }
    }

    if (formConfig.actions?.addToGroupId && personId) {
      try {
        const groupId = formConfig.actions.addToGroupId;
        await pcoRequest(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships`, 'POST', {
          data: {
            type: 'Membership',
            relationships: {
              person: { data: { type: 'Person', id: personId } }
            }
          }
        });
        log.info(`Added person ${personId} to PCO group ${groupId}`, 'forms', { personId, groupId }, churchId);
      } catch (grpErr: any) {
        log.warn(`Failed to auto-add user to Group: ${grpErr.message}`, 'forms', { personId }, churchId);
      }
    }

    if (formConfig.actions?.enrollInWorkflowId && personId) {
      try {
        const workflowId = formConfig.actions.enrollInWorkflowId;
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/workflows/${workflowId}/cards`, 'POST', {
          data: {
            type: 'Card',
            relationships: {
              person: { data: { type: 'Person', id: personId } }
            }
          }
        });
        log.info(`Enrolled person ${personId} in PCO workflow ${workflowId}`, 'forms', { personId, workflowId }, churchId);
      } catch (wfErr: any) {
        log.warn(`Failed to auto-enroll user in Workflow: ${wfErr.message}`, 'forms', { personId }, churchId);
      }
    }

    if (medicalNotes) {
      noteLines.push(`• Medical Notes & Allergies: ${medicalNotes}`);
    }
    if (maritalStatus) {
      noteLines.push(`• Marital Status: ${maritalStatus}`);
    }
    if (generalNotes) {
      noteLines.push('\nComments / Prayer Requests:');
      noteLines.push(generalNotes);
    }

    if ((noteLines.length > 0 || generalNotes) && personId) {
      try {
        const noteBody = `Form Submission: ${formConfig.name}\n\n${noteLines.join('\n')}`;
        const notePayload: any = {
          data: {
            type: 'Note',
            attributes: {
              note: noteBody
            }
          }
        };

        if (formConfig.actions?.noteCategoryId) {
          notePayload.data.relationships = {
            note_category: {
              data: {
                type: 'NoteCategory',
                id: formConfig.actions.noteCategoryId
              }
            }
          };
        }

        await pcoRequest(
          churchId, 
          `https://api.planningcenteronline.com/people/v2/people/${personId}/notes`, 
          'POST', 
          notePayload
        );
        log.info(`Wrote submission note to PCO person ${personId}`, 'forms', { personId }, churchId);
      } catch (noteErr: any) {
        log.warn(`Failed to write PCO profile note: ${noteErr.message}`, 'forms', { personId }, churchId);
      }
    }

    // Update submission status to success
    await db.collection('pco_form_submissions').doc(submissionId).update({
      matchedPersonId: personId || null,
      isNewPerson,
      status: 'success'
    });

    if (formId.startsWith('ius_')) {
      const sessionRef = db.collection('people_info_sessions').doc(formId);
      const sessionDoc = await sessionRef.get();
      if (sessionDoc.exists) {
        const history = sessionDoc.data()?.conversationHistory || [];
        history.push({
          role: 'system',
          content: 'Form submitted successfully via web link.',
          timestamp: Date.now()
        });
        await sessionRef.update({
          status: 'complete',
          lastActionAt: Date.now(),
          conversationHistory: history,
          pcoPersonId: personId || sessionDoc.data()?.pcoPersonId
        });
        log.info(`Marked session ${formId} as complete after web form submission`, 'forms', { formId }, churchId);
      }
    }

    res.json({ success: true, personId, isNewPerson });
  } catch (e: any) {
    log.error(`Form submission error: ${e.message}`, 'forms', { formId }, churchId);
    
    // Update submission status to failed
    await db.collection('pco_form_submissions').doc(submissionId).set({
      status: 'failed',
      errorDetails: e.message
    }, { merge: true });

    res.status(500).json({ error: e.message });
  }
}

// 6. POST /api/forms/:churchId/:formId/sync-all
// Re-runs the full PCO sync pipeline for every stored submission of a form.
export async function syncAllSubmissions(req: any, res: any) {
  const { churchId, formId } = req.params;
  const db = getDb();
  const log = (await import('../services/logService.js')).createServerLogger(db);

  try {
    // Load form config
    const formDoc = await db.collection('pco_forms').doc(formId).get();
    if (!formDoc.exists || formDoc.data()?.churchId !== churchId) {
      return res.status(404).json({ error: 'Form not found' });
    }
    const formConfig = formDoc.data()!;

    // Load all submissions for this form
    const subsSnap = await db.collection('pco_form_submissions')
      .where('formId', '==', formId)
      .where('churchId', '==', churchId)
      .get();

    if (subsSnap.empty) {
      return res.json({ synced: 0, results: [] });
    }

    const submissions = subsSnap.docs.map((d: DocumentData) => ({ id: d.id, ...d.data() }));

    const results: { submissionId: string; status: 'success' | 'failed'; personId?: string; isNewPerson?: boolean; error?: string }[] = [];

    // Build customFields (same migration logic as submitForm)
    let customFields = formConfig.customFields || [];
    if (customFields.length === 0 && formConfig.fields) {
      Object.entries(formConfig.fields).forEach(([key, f]: any) => {
        if (f.enabled) {
          customFields.push({
            id: key,
            type: key === 'interests' ? 'checkboxes' : key === 'firstTimeVisitor' ? 'checkbox_single' : key === 'medicalNotes' || key === 'notes' ? 'paragraph' : 'text',
            label: f.customLabel || f.label,
            required: !!f.required,
            mapToPco: key,
            options: key === 'interests' ? ['Connect Group', 'Serving / Volunteer', 'Baptism', 'Membership', 'Child Dedication', 'Other'] : undefined
          });
        }
      });
    }

    for (const sub of submissions) {
      const submissionsData = sub.data || {};
      const submissionId = sub.id;

      try {
        let firstName = '', lastName = '', email = '', phone = '', middleName = '', nickname = '';
        let gender = '', birthday = '', anniversary = '', maritalStatus = '', medicalNotes = '', grade = '';
        let street = '', city = '', state = '', zip = '';
        const noteLines: string[] = [];
        let generalNotes = '';

        customFields.forEach((field: any) => {
          const val = submissionsData[field.id];
          if (val === undefined || val === null || val === '') return;
          const displayVal = Array.isArray(val) ? val.join(', ') : (typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val));

          if (field.mapToPco === 'firstName') firstName = String(val).trim();
          else if (field.mapToPco === 'lastName') lastName = String(val).trim();
          else if (field.mapToPco === 'email') email = String(val).trim();
          else if (field.mapToPco === 'phone') phone = String(val).trim();
          else if (field.mapToPco === 'middleName') middleName = String(val).trim();
          else if (field.mapToPco === 'nickname') nickname = String(val).trim();
          else if (field.mapToPco === 'gender') gender = String(val).trim();
          else if (field.mapToPco === 'birthday') birthday = String(val).trim();
          else if (field.mapToPco === 'anniversary') anniversary = String(val).trim();
          else if (field.mapToPco === 'maritalStatus') maritalStatus = String(val).trim();
          else if (field.mapToPco === 'medicalNotes') medicalNotes = String(val).trim();
          else if (field.mapToPco === 'grade') grade = String(val).trim();
          else if (field.mapToPco === 'street') street = String(val).trim();
          else if (field.mapToPco === 'city') city = String(val).trim();
          else if (field.mapToPco === 'state') state = String(val).trim();
          else if (field.mapToPco === 'zip') zip = String(val).trim();
          else if (field.mapToPco === 'notes') generalNotes = String(val).trim();
          else {
            if (field.type !== 'section_heading' && field.type !== 'text_block') {
              noteLines.push(`• ${field.label}: ${displayVal}`);
            }
          }
        });

        // Match or create PCO person
        let matchedPersonId: string | null = null;
        if (email) {
          const emailQuery = `https://api.planningcenteronline.com/people/v2/emails?where[address]=${encodeURIComponent(email)}`;
          const searchRes = await pcoRequest(churchId, emailQuery, 'GET');
          if (searchRes.data && searchRes.data.length > 0) {
            matchedPersonId = searchRes.data[0].relationships?.person?.data?.id || null;
          }
        }
        if (!matchedPersonId && phone) {
          const digitsOnly = phone.replace(/\D/g, '');
          const phoneQuery = `https://api.planningcenteronline.com/people/v2/phone_numbers?where[number]=${digitsOnly}`;
          const searchRes = await pcoRequest(churchId, phoneQuery, 'GET');
          if (searchRes.data && searchRes.data.length > 0) {
            matchedPersonId = searchRes.data[0].relationships?.person?.data?.id || null;
          }
        }

        let isNewPerson = false;
        let personId = matchedPersonId;

        const personAttributes: any = {};
        if (firstName) personAttributes.first_name = firstName;
        if (lastName) personAttributes.last_name = lastName;
        if (middleName) personAttributes.middle_name = middleName;
        if (nickname) personAttributes.nickname = nickname;
        if (gender) personAttributes.gender = gender;
        if (birthday) personAttributes.birthdate = birthday;
        if (anniversary) personAttributes.anniversary = anniversary;
        if (medicalNotes) personAttributes.medical_notes = medicalNotes;
        if (grade !== undefined && grade !== null && grade !== '') {
          personAttributes.grade = parseInt(grade, 10);
        }

        if (personId) {
          await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}`, 'PATCH',
            { data: { type: 'Person', id: personId, attributes: personAttributes } });
        } else {
          isNewPerson = true;
          const createRes = await pcoRequest(churchId, 'https://api.planningcenteronline.com/people/v2/people', 'POST',
            { data: { type: 'Person', attributes: personAttributes } });
          personId = createRes.data?.id;
          if (!personId) throw new Error('Failed to create person in PCO');
        }

        if (email && personId) {
          const checkEmails = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`, 'GET');
          const existingEmail = checkEmails.data?.find((e: any) => e.attributes?.address?.toLowerCase() === email.toLowerCase());
          if (!existingEmail) {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`, 'POST',
              { data: { type: 'Email', attributes: { address: email, location: 'Home' } } });
          }
        }

        if (phone && personId) {
          const checkPhones = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`, 'GET');
          const normalizedNewPhone = phone.replace(/\D/g, '');
          const existingPhone = checkPhones.data?.find((p: any) => (p.attributes?.number || '').replace(/\D/g, '') === normalizedNewPhone);
          if (!existingPhone) {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`, 'POST',
              { data: { type: 'PhoneNumber', attributes: { number: phone, location: 'Mobile' } } });
          }
        }

        if ((street || city || state || zip) && personId) {
          const checkAddresses = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/addresses`, 'GET');
          const existingAddress = checkAddresses.data?.find((a: any) => a.attributes?.location === 'Home' || a.attributes?.primary);
          const addressPayload = { data: { type: 'Address', attributes: { street_line_1: street || '', city: city || '', state: state || '', zip: zip || '', location: 'Home', primary: true } } };
          if (existingAddress) {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/addresses/${existingAddress.id}`, 'PATCH', addressPayload);
          } else {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/addresses`, 'POST', addressPayload);
          }
        }

        if (formConfig.actions?.addToGroupId && personId) {
          try {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${formConfig.actions.addToGroupId}/memberships`, 'POST',
              { data: { type: 'Membership', relationships: { person: { data: { type: 'Person', id: personId } } } } });
          } catch (grpErr: any) {
            log.warn(`Force-sync: failed to add to group: ${grpErr.message}`, 'forms', { submissionId }, churchId);
          }
        }

        if (formConfig.actions?.enrollInWorkflowId && personId) {
          try {
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/workflows/${formConfig.actions.enrollInWorkflowId}/cards`, 'POST',
              { data: { type: 'Card', relationships: { person: { data: { type: 'Person', id: personId } } } } });
          } catch (wfErr: any) {
            log.warn(`Force-sync: failed to enroll in workflow: ${wfErr.message}`, 'forms', { submissionId }, churchId);
          }
        }

        if (medicalNotes) noteLines.push(`• Medical Notes & Allergies: ${medicalNotes}`);
        if (maritalStatus) noteLines.push(`• Marital Status: ${maritalStatus}`);
        if (generalNotes) { noteLines.push('\nComments / Prayer Requests:'); noteLines.push(generalNotes); }

        if ((noteLines.length > 0 || generalNotes) && personId) {
          try {
            const noteBody = `Form Submission: ${formConfig.name}\n\n${noteLines.join('\n')}`;
            const notePayload: any = { data: { type: 'Note', attributes: { note: noteBody } } };
            if (formConfig.actions?.noteCategoryId) {
              notePayload.data.relationships = { note_category: { data: { type: 'NoteCategory', id: formConfig.actions.noteCategoryId } } };
            }
            await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/notes`, 'POST', notePayload);
          } catch (noteErr: any) {
            log.warn(`Force-sync: failed to write note: ${noteErr.message}`, 'forms', { submissionId }, churchId);
          }
        }

        // Update submission record
        await db.collection('pco_form_submissions').doc(submissionId).update({
          matchedPersonId: personId || null,
          isNewPerson,
          status: 'success',
          forceSyncedAt: Date.now()
        });

        results.push({ submissionId, status: 'success', personId: personId || undefined, isNewPerson });
        log.info(`Force-sync success for submission ${submissionId} → PCO person ${personId}`, 'forms', { submissionId, personId }, churchId);
      } catch (subErr: any) {
        log.error(`Force-sync failed for submission ${submissionId}: ${subErr.message}`, 'forms', { submissionId }, churchId);
        await db.collection('pco_form_submissions').doc(submissionId).update({
          status: 'failed',
          errorDetails: subErr.message,
          forceSyncedAt: Date.now()
        });
        results.push({ submissionId, status: 'failed', error: subErr.message });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    res.json({ synced: successCount, failed: failedCount, total: results.length, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
