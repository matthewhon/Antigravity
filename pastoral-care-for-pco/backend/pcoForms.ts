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
    let matchedPersonId: string | null = null;

    if (submissionsData.email) {
      const emailQuery = `https://api.planningcenteronline.com/people/v2/emails?where[address]=${encodeURIComponent(submissionsData.email.trim())}`;
      const searchRes = await pcoRequest(churchId, emailQuery, 'GET');
      if (searchRes.data && searchRes.data.length > 0) {
        matchedPersonId = searchRes.data[0].relationships?.person?.data?.id || null;
      }
    }

    if (!matchedPersonId && submissionsData.phone) {
      // Strip formatting to search numbers
      const digitsOnly = submissionsData.phone.replace(/\D/g, '');
      const phoneQuery = `https://api.planningcenteronline.com/people/v2/phone_numbers?where[number]=${digitsOnly}`;
      const searchRes = await pcoRequest(churchId, phoneQuery, 'GET');
      if (searchRes.data && searchRes.data.length > 0) {
        matchedPersonId = searchRes.data[0].relationships?.person?.data?.id || null;
      }
    }

    let isNewPerson = false;
    let personId = matchedPersonId;

    // Build standard attributes mapping
    const personAttributes: any = {};
    if (submissionsData.firstName) personAttributes.first_name = submissionsData.firstName;
    if (submissionsData.lastName) personAttributes.last_name = submissionsData.lastName;
    if (submissionsData.middleName) personAttributes.middle_name = submissionsData.middleName;
    if (submissionsData.nickname) personAttributes.nickname = submissionsData.nickname;
    if (submissionsData.gender) personAttributes.gender = submissionsData.gender;
    if (submissionsData.birthday) personAttributes.birthdate = submissionsData.birthday;
    if (submissionsData.anniversary) personAttributes.anniversary = submissionsData.anniversary;
    if (submissionsData.maritalStatus) personAttributes.marital_status = submissionsData.maritalStatus;
    if (submissionsData.medicalNotes) personAttributes.medical_notes = submissionsData.medicalNotes;
    if (submissionsData.grade !== undefined && submissionsData.grade !== null && submissionsData.grade !== '') {
      personAttributes.grade = parseInt(submissionsData.grade, 10);
    }

    if (personId) {
      // Overwrite existing person attributes
      log.info(`Matching PCO user found: ${personId}. Overwriting profile.`, 'forms', { personId }, churchId);
      await pcoRequest(
        churchId,
        `https://api.planningcenteronline.com/people/v2/people/${personId}`,
        'PATCH',
        { data: { type: 'Person', id: personId, attributes: personAttributes } }
      );
    } else {
      // Create new PCO person
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

    // 3. Add/Overwrite contact info (Email, Phone, Address)
    if (submissionsData.email && personId) {
      // Check if this person already has this email
      const checkEmails = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`, 'GET');
      const existingEmail = checkEmails.data?.find((e: any) => e.attributes?.address?.toLowerCase() === submissionsData.email.trim().toLowerCase());
      
      if (!existingEmail) {
        // Create new email entry
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`, 'POST', {
          data: {
            type: 'Email',
            attributes: { address: submissionsData.email.trim(), location: 'Home' }
          }
        });
      }
    }

    if (submissionsData.phone && personId) {
      // Check if this person already has this phone number
      const checkPhones = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`, 'GET');
      const normalizedNewPhone = submissionsData.phone.replace(/\D/g, '');
      const existingPhone = checkPhones.data?.find((p: any) => (p.attributes?.number || '').replace(/\D/g, '') === normalizedNewPhone);

      if (!existingPhone) {
        // Create new phone entry
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`, 'POST', {
          data: {
            type: 'PhoneNumber',
            attributes: { number: submissionsData.phone.trim(), location: 'Mobile' }
          }
        });
      }
    }

    if ((submissionsData.street || submissionsData.city || submissionsData.state || submissionsData.zip) && personId) {
      // For address: fetch existing addresses and overwrite primary, or create new
      const checkAddresses = await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/addresses`, 'GET');
      const existingAddress = checkAddresses.data?.find((a: any) => a.attributes?.location === 'Home' || a.attributes?.primary);

      const addressPayload = {
        data: {
          type: 'Address',
          attributes: {
            street: submissionsData.street || '',
            city: submissionsData.city || '',
            state: submissionsData.state || '',
            zip: submissionsData.zip || '',
            location: 'Home',
            primary: true
          }
        }
      };

      if (existingAddress) {
        // Overwrite the existing address
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/addresses/${existingAddress.id}`, 'PATCH', addressPayload);
      } else {
        // Create new address
        await pcoRequest(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/addresses`, 'POST', addressPayload);
      }
    }

    // 4. Run post-submission automations
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

    // 5. Save Comments/Notes to Planning Center profile notes
    const noteLines: string[] = [];
    
    if (submissionsData.firstTimeVisitor !== undefined && submissionsData.firstTimeVisitor !== '') {
      const isFirstTime = submissionsData.firstTimeVisitor === 'true' || submissionsData.firstTimeVisitor === true;
      noteLines.push(`• First Time Visitor: ${isFirstTime ? 'Yes' : 'No'}`);
    }
    if (submissionsData.howHeard) {
      noteLines.push(`• How they heard about us: ${submissionsData.howHeard}`);
    }
    if (submissionsData.interests) {
      const parsedInterests = Array.isArray(submissionsData.interests) 
        ? submissionsData.interests.join(', ') 
        : submissionsData.interests;
      noteLines.push(`• Next Steps Interests: ${parsedInterests}`);
    }
    
    // Custom Questions
    if (formConfig.fields?.customQuestion1?.enabled && submissionsData.customQuestion1) {
      const q1Label = formConfig.fields.customQuestion1.customLabel || 'Custom Question 1';
      noteLines.push(`• ${q1Label}: ${submissionsData.customQuestion1}`);
    }
    if (formConfig.fields?.customQuestion2?.enabled && submissionsData.customQuestion2) {
      const q2Label = formConfig.fields.customQuestion2.customLabel || 'Custom Question 2';
      noteLines.push(`• ${q2Label}: ${submissionsData.customQuestion2}`);
    }

    // Include other standard profile fields in the note for visibility if enabled/submitted
    if (submissionsData.birthday) {
      noteLines.push(`• Birthday: ${submissionsData.birthday}`);
    }
    if (submissionsData.gender) {
      noteLines.push(`• Gender: ${submissionsData.gender}`);
    }
    if (submissionsData.maritalStatus) {
      noteLines.push(`• Marital Status: ${submissionsData.maritalStatus}`);
    }
    if (submissionsData.anniversary) {
      noteLines.push(`• Anniversary: ${submissionsData.anniversary}`);
    }
    if (submissionsData.grade !== undefined && submissionsData.grade !== '') {
      const gradeNames: Record<string, string> = {
        '0': 'Kindergarten', '1': '1st Grade', '2': '2nd Grade', '3': '3rd Grade',
        '4': '4th Grade', '5': '5th Grade', '6': '6th Grade', '7': '7th Grade',
        '8': '8th Grade', '9': '9th Grade', '10': '10th Grade', '11': '11th Grade',
        '12': '12th Grade'
      };
      const gradeVal = submissionsData.grade.toString();
      noteLines.push(`• School Grade: ${gradeNames[gradeVal] || gradeVal}`);
    }
    if (submissionsData.medicalNotes) {
      noteLines.push(`• Medical Notes & Allergies: ${submissionsData.medicalNotes}`);
    }

    // Add comments/prayer request notes at the end
    if (submissionsData.notes) {
      noteLines.push('\nComments / Prayer Requests:');
      noteLines.push(submissionsData.notes);
    }

    if ((noteLines.length > 0 || submissionsData.notes) && personId) {
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
