import { getDb } from './firebase.js';
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
    const docSnap = await db.collection('pco_forms').doc(formId).get();
    
    if (!docSnap.exists || docSnap.data()?.churchId !== churchId || !docSnap.data()?.isActive) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    const data = docSnap.data()!;
    // Return a safe subset for public view
    res.json({
      id: data.id,
      churchId: data.churchId,
      name: data.name,
      description: data.description || null,
      fields: data.fields,
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
    const formDoc = await db.collection('pco_forms').doc(formId).get();
    if (!formDoc.exists || formDoc.data()?.churchId !== churchId) {
      return res.status(404).json({ error: 'Form not found' });
    }
    const formConfig = formDoc.data()!;

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
    if (maritalStatus) personAttributes.marital_status = maritalStatus;
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
            street: street || '',
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
