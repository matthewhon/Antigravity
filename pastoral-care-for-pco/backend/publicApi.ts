import { getDb } from './firebase.js';

// Simple in-memory cache: { "churchId_type": { data: any, timestamp: number } }
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchFromPco(churchId: string, url: string, method: string = 'GET', body?: any) {
  const db = getDb();
  const churchDoc = await db.collection('churches').doc(churchId).get();
  if (!churchDoc.exists) throw new Error('Church not found');
  const churchData = churchDoc.data();
  let accessToken = churchData?.pcoAccessToken;
  const refreshToken = churchData?.pcoRefreshToken;

  if (!accessToken) throw new Error('No PCO access token');

  const performReq = async (token: string) => {
    return fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PastoralCareApp/1.0'
      },
      body: body ? JSON.stringify(body) : undefined
    });
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
        method: 'POST', body: refreshParams
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
    let errorMsg = `PCO API error: ${response.status}`;
    if (response.status === 401) errorMsg = 'Unauthorized: Planning Center Token expired or invalid. Please re-authenticate your church account.';
    if (response.status === 403) errorMsg = 'Forbidden: Your Planning Center connection lacks the necessary scopes (e.g. giving/people). Please re-authenticate to upgrade your permissions.';
    throw new Error(errorMsg);
  }
  return response.json();
}

export async function fetchAllFromPco(churchId: string, initialUrl: string, maxPages: number = 10): Promise<{ data: any[]; included: any[] }> {
  let allData: any[] = [];
  let allIncluded: any[] = [];
  let nextUrl: string | null = initialUrl;
  let page = 0;

  while (nextUrl && page < maxPages) {
    page++;
    try {
      const res = await fetchFromPco(churchId, nextUrl);
      if (res.data && Array.isArray(res.data)) {
        allData = allData.concat(res.data);
      }
      if (res.included && Array.isArray(res.included)) {
        allIncluded = allIncluded.concat(res.included);
      }
      nextUrl = res.links?.next || null;
    } catch (e) {
      console.warn(`[fetchAllFromPco] Pagination stopped at page ${page}:`, e);
      break;
    }
  }

  return { data: allData, included: allIncluded };
}

export async function getPublicGroups(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_groups`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/groups/v2/groups?include=group_type&per_page=100');
    const included = data.included || [];
    const groups = (data.data || []).map((g: any) => {
      const typeId = g.relationships?.group_type?.data?.id;
      const typeObj = included.find((i: any) => i.type === 'GroupType' && i.id === typeId);
      return {
        id: g.id,
        name: g.attributes.name,
        groupTypeName: typeObj?.attributes?.name || 'Small Group',
        description: g.attributes.description,
        membersCount: g.attributes.members_count || 0,
        headerImage: g.attributes.header_image?.medium || g.attributes.header_image?.thumbnail || null,
        publicUrl: g.attributes.public_church_center_web_url || g.attributes.public_url || null,
        isPublic: g.attributes.publicly_visible !== false
      };
    });
    const publicGroups = groups.filter((g: any) => g.isPublic && !g.attributes?.archived_at);
    cache[cacheKey] = { data: publicGroups, timestamp: Date.now() };
    res.json(publicGroups);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicRegistrations(req: any, res: any) {
  const { churchId } = req.params;
  const includeArchived = req.query.includeArchived === 'true';
  const cacheKey = `${churchId}_registrations_${includeArchived}`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const url = includeArchived 
      ? 'https://api.planningcenteronline.com/registrations/v2/signups?per_page=100'
      : 'https://api.planningcenteronline.com/registrations/v2/signups?per_page=100&filter=unarchived';
      
    const data = await fetchFromPco(churchId, url);
    
    // Filter out archived registration events (fallback if attribute exists)
    let rawEvents = data.data || [];
    if (!includeArchived) {
      rawEvents = rawEvents.filter((e: any) => !e.attributes?.archived_at);
    }

    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchData = churchDoc.exists ? churchDoc.data() : null;
    const subdomain = churchData?.subdomain || '';
    const events = rawEvents.map((e: any) => ({
      id: e.id,
      name: e.attributes.name,
      description: e.attributes.description,
      logoUrl: e.attributes.logo_url || null,
      signupsCount: e.attributes.signups_count || 0,
      startsAt: e.attributes.starts_at || e.attributes.event_time || null,
      location: e.attributes.location || e.attributes.location_name || null,
      publicUrl: e.attributes.church_center_url || e.attributes.public_url || e.attributes.public_church_center_web_url || (subdomain ? `https://${subdomain}.churchcenter.com/registrations/events/${e.id}` : null),
    }));
    cache[cacheKey] = { data: events, timestamp: Date.now() };
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicEvents(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_events`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/calendar/v2/event_instances?include=event&filter=future&per_page=100');
    
    const includedEvents = data.included || [];

    const events = (data.data || []).map((instance: any) => {
      const eventId = instance.relationships?.event?.data?.id;
      const parentEvent = includedEvents.find((inc: any) => inc.type === 'Event' && inc.id === eventId);
      const eventDetails = parentEvent ? parentEvent.attributes : {};

      return {
        id: instance.id,
        name: eventDetails.name || instance.attributes.title || 'Unnamed Event',
        description: eventDetails.description || null,
        startsAt: instance.attributes.starts_at || null,
        endsAt: instance.attributes.ends_at || null,
        location: instance.attributes.location || eventDetails.location || null,
        publicUrl: eventDetails.church_center_url || eventDetails.public_url || null,
        imageUrl: eventDetails.image_url || null,
      };
    });
    cache[cacheKey] = { data: events, timestamp: Date.now() };
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicForms(req: any, res: any) {
  const { churchId } = req.params;
  const cacheKey = `${churchId}_forms`;
  
  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/people/v2/forms?per_page=100');
    
    // Filter active forms
    const rawForms = (data.data || []).filter((f: any) => f.attributes.active !== false && !f.attributes.archived_at);

    const forms = rawForms.map((f: any) => ({
      id: f.id,
      name: f.attributes.name,
      description: f.attributes.description || null,
      active: f.attributes.active !== false,
      publicUrl: f.attributes.church_center_url || f.attributes.public_url || null,
    }));
    cache[cacheKey] = { data: forms, timestamp: Date.now() };
    res.json(forms);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function setFeaturedEvent(req: any, res: any) {
  const { churchId } = req.params;
  const { eventId, eventSource } = req.body;
  if (!eventId || !eventSource) return res.status(400).json({ error: 'Missing eventId or eventSource' });

  try {
    const db = getDb();
    await db.collection('churches').doc(churchId).update({
      featuredEventId: eventId,
      featuredEventSource: eventSource,
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getFeaturedEvent(req: any, res: any) {
  const { churchId } = req.params;
  try {
    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    if (!churchDoc.exists) return res.status(404).json({ error: 'Church not found' });
    
    const data = churchDoc.data();
    res.json({ 
      eventId: data?.featuredEventId || null,
      eventSource: data?.featuredEventSource || 'calendar'
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicPledgeCampaigns(req: any, res: any) {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  const { churchId } = req.params;
  const cacheKey = `${churchId}_pledge_campaigns`;

  if (req.query.refresh !== 'true' && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchData = churchDoc.exists ? churchDoc.data() : null;
    const subdomain = churchData?.subdomain || '';

    // Fetch campaigns from PCO Giving API
    const pcoData = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/giving/v2/pledge_campaigns?include=fund&per_page=100');
    const rawCampaigns = pcoData.data || [];
    const included = pcoData.included || [];

    // Fetch custom configs for this church from Firestore
    const configsSnap = await db.collection('churches').doc(churchId).collection('pledge_campaign_configs').get();
    const configsMap = new Map<string, any>();
    configsSnap.docs.forEach(doc => configsMap.set(doc.id, doc.data()));

    // Process campaigns and calculate pledge and giving stats
    const campaigns = await Promise.all(rawCampaigns.map(async (c: any) => {
      const fundId = c.relationships?.fund?.data?.id;
      const fundObj = included.find((i: any) => i.type === 'Fund' && i.id === fundId);
      const customConfig = configsMap.get(c.id) || {};
      const pcoStartsAt = c.attributes?.starts_at || null;
      const pcoEndsAt = c.attributes?.ends_at || null;

      // Effective Beginning & End Dates (Custom override takes precedence over PCO dates)
      const effectiveStartDate = customConfig.startDate || (pcoStartsAt ? pcoStartsAt.slice(0, 10) : '');
      const effectiveEndDate = customConfig.endDate || (pcoEndsAt ? pcoEndsAt.slice(0, 10) : '');

      let totalPledgedCents = 0;
      let pledgeCount = 0;

      // 1. Fetch all pledges across pages for this campaign, filtering by date window if set
      try {
        const pledgesRes = await fetchAllFromPco(churchId, `https://api.planningcenteronline.com/giving/v2/pledge_campaigns/${c.id}/pledges?per_page=100`);
        const pledgesList = pledgesRes.data || [];
        const matchingPledges = pledgesList.filter((p: any) => {
          const pledgeDate = (p.attributes?.created_at || p.attributes?.updated_at || '').slice(0, 10);
          if (effectiveStartDate && pledgeDate && pledgeDate < effectiveStartDate) return false;
          if (effectiveEndDate && pledgeDate && pledgeDate > effectiveEndDate) return false;
          return true;
        });
        pledgeCount = matchingPledges.length;
        totalPledgedCents = matchingPledges.reduce((sum: number, p: any) => sum + (p.attributes?.amount_cents || 0), 0);
      } catch (err) {
        console.warn(`[publicApi] Could not fetch pledges for campaign ${c.id}:`, err);
      }

      // 2. Fetch total money given to the campaign fund within the date range [effectiveStartDate, effectiveEndDate]
      const pcoReceivedFromPledges = c.attributes?.received_total_from_pledges_cents || 0;
      const pcoReceivedOutsidePledges = c.attributes?.received_total_outside_of_pledges_cents || 0;
      const pcoTotalReceivedCents = pcoReceivedFromPledges + pcoReceivedOutsidePledges;

      const pcoStartsStr = pcoStartsAt ? pcoStartsAt.slice(0, 10) : '';
      const pcoEndsStr = pcoEndsAt ? pcoEndsAt.slice(0, 10) : '';
      const isCustomDate = Boolean(
        (customConfig.startDate && customConfig.startDate !== pcoStartsStr) ||
        (customConfig.endDate && customConfig.endDate !== pcoEndsStr)
      );

      let totalReceivedCents = 0;
      let donorsCount = 0;

      if (!isCustomDate) {
        // Use Planning Center's officially computed live campaign totals directly
        totalReceivedCents = pcoTotalReceivedCents;
      } else if (fundId) {
        try {
          const donationsSnap = await db.collection('donations')
            .where('churchId', '==', churchId)
            .where('fundId', '==', fundId)
            .get();

          if (!donationsSnap.empty) {
            const uniqueDonors = new Set<string>();
            donationsSnap.docs.forEach(d => {
              const data = d.data();
              const donationDate = (data.date || '').slice(0, 10);
              const afterStart = !effectiveStartDate || donationDate >= effectiveStartDate;
              const beforeEnd = !effectiveEndDate || donationDate <= effectiveEndDate;
              if (afterStart && beforeEnd) {
                totalReceivedCents += Math.round((data.amount || 0) * 100);
                if (data.donorId && data.donorId !== 'anonymous') {
                  uniqueDonors.add(data.donorId);
                }
              }
            });
            donorsCount = uniqueDonors.size;
          } else {
            // Live fallback query to PCO Giving
            const sinceDate = effectiveStartDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
            let url = `https://api.planningcenteronline.com/giving/v2/donations?where[received_at][gte]=${sinceDate}&include=designations&per_page=100`;
            if (effectiveEndDate) {
              url += `&where[received_at][lte]=${effectiveEndDate}T23:59:59Z`;
            }
            const liveDonations = await fetchAllFromPco(churchId, url, 10);
            const liveIncluded = liveDonations.included || [];
            const uniqueLiveDonors = new Set<string>();

            (liveDonations.data || []).forEach((d: any) => {
              const donorId = d.relationships?.person?.data?.id;
              const donationDate = (d.attributes?.received_at || '').slice(0, 10);
              const afterStart = !effectiveStartDate || donationDate >= effectiveStartDate;
              const beforeEnd = !effectiveEndDate || donationDate <= effectiveEndDate;
              if (afterStart && beforeEnd) {
                const designationRefs = d.relationships?.designations?.data || [];
                designationRefs.forEach((ref: any) => {
                  const des = liveIncluded.find((i: any) => i.type === 'Designation' && String(i.id) === String(ref.id));
                  if (des && des.relationships?.fund?.data?.id === fundId) {
                    totalReceivedCents += des.attributes?.amount_cents || 0;
                    if (donorId) uniqueLiveDonors.add(donorId);
                  }
                });
              }
            });
            donorsCount = uniqueLiveDonors.size;
          }
        } catch (e) {
          console.warn(`[publicApi] Error calculating donations for fund ${fundId}:`, e);
        }

        if (totalReceivedCents === 0 && !customConfig.startDate && !customConfig.endDate) {
          totalReceivedCents = pcoTotalReceivedCents;
        }
      }

      const churchCenterUrl = subdomain
        ? `https://${subdomain}.churchcenter.com/giving?campaign=${c.id}${fundId ? `&fund_id=${fundId}` : ''}`
        : `https://churchcenter.com/giving`;

      return {
        id: c.id,
        name: c.attributes?.name || 'Unnamed Campaign',
        description: c.attributes?.description || '',
        startDate: effectiveStartDate || null,
        endDate: effectiveEndDate || null,
        pcoStartsAt,
        pcoEndsAt,
        startsAt: effectiveStartDate || pcoStartsAt,
        endsAt: effectiveEndDate || pcoEndsAt,
        goalCents: c.attributes?.goal_cents || 0,
        goalCurrency: c.attributes?.goal_currency || 'USD',
        showGoalInChurchCenter: c.attributes?.show_goal_in_church_center ?? true,
        showProgressInChurchCenter: c.attributes?.show_progress_in_church_center ?? true,
        fundId: fundId || null,
        fundName: fundObj?.attributes?.name || 'General Fund',
        churchCenterUrl,
        totalPledgedCents,
        pledgeCount,
        totalReceivedCents,
        donorsCount,
        progressBasis: customConfig.progressBasis || 'both', // 'both' | 'received' | 'pledged'
        imageUrl: customConfig.imageUrl || null,
        bannerUrl: customConfig.bannerUrl || null,
        headline: customConfig.headline || '',
        storyMarkdown: customConfig.storyMarkdown || '',
        graphicStyle: customConfig.graphicStyle || 'progress_bar',
        colorTheme: customConfig.colorTheme || 'indigo',
        showMetrics: customConfig.showMetrics || {
          goal: true,
          pledged: true,
          received: true,
          percent: true,
          pledgers: true,
          daysLeft: true,
        },
        milestones: customConfig.milestones || [],
        allowOnlinePledging: customConfig.allowOnlinePledging !== false,
        givingEmbedMode: customConfig.givingEmbedMode || 'modal',
        givingButtonText: customConfig.givingButtonText || 'Give to Campaign',
        pledgeButtonText: customConfig.pledgeButtonText || 'Pledge Now',
        updatedAt: customConfig.updatedAt || null,
      };
    }));

    cache[cacheKey] = { data: campaigns, timestamp: Date.now() };
    res.json(campaigns);
  } catch (e: any) {
    console.error('[publicApi] getPublicPledgeCampaigns error:', e);
    res.status(500).json({ error: e.message });
  }
}

export async function getPublicPledgeCampaign(req: any, res: any) {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  const { churchId, campaignId } = req.params;
  try {
    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchData = churchDoc.exists ? churchDoc.data() : null;
    const subdomain = churchData?.subdomain || '';

    const pcoData = await fetchFromPco(churchId, `https://api.planningcenteronline.com/giving/v2/pledge_campaigns/${campaignId}?include=fund`);
    const c = pcoData.data;
    if (!c) return res.status(404).json({ error: 'Pledge Campaign not found' });

    const fundId = c.relationships?.fund?.data?.id;
    const fundObj = (pcoData.included || []).find((i: any) => i.type === 'Fund' && i.id === fundId);

    const configDoc = await db.collection('churches').doc(churchId).collection('pledge_campaign_configs').doc(campaignId).get();
    const customConfig = configDoc.exists ? configDoc.data() || {} : {};
    const pcoStartsAt = c.attributes?.starts_at || null;
    const pcoEndsAt = c.attributes?.ends_at || null;

    const effectiveStartDate = customConfig.startDate || (pcoStartsAt ? pcoStartsAt.slice(0, 10) : '');
    const effectiveEndDate = customConfig.endDate || (pcoEndsAt ? pcoEndsAt.slice(0, 10) : '');

    let totalPledgedCents = 0;
    let pledgeCount = 0;

    try {
      const pledgesRes = await fetchAllFromPco(churchId, `https://api.planningcenteronline.com/giving/v2/pledge_campaigns/${campaignId}/pledges?per_page=100`);
      const pledgesList = pledgesRes.data || [];
      const matchingPledges = pledgesList.filter((p: any) => {
        const pledgeDate = (p.attributes?.created_at || p.attributes?.updated_at || '').slice(0, 10);
        if (effectiveStartDate && pledgeDate && pledgeDate < effectiveStartDate) return false;
        if (effectiveEndDate && pledgeDate && pledgeDate > effectiveEndDate) return false;
        return true;
      });
      pledgeCount = matchingPledges.length;
      totalPledgedCents = matchingPledges.reduce((sum: number, p: any) => sum + (p.attributes?.amount_cents || 0), 0);
    } catch (err) {
      console.warn(`[publicApi] Could not fetch pledges for campaign ${campaignId}:`, err);
    }

    const pcoReceivedFromPledges = c.attributes?.received_total_from_pledges_cents || 0;
    const pcoReceivedOutsidePledges = c.attributes?.received_total_outside_of_pledges_cents || 0;
    const pcoTotalReceivedCents = pcoReceivedFromPledges + pcoReceivedOutsidePledges;

    const pcoStartsStr = pcoStartsAt ? pcoStartsAt.slice(0, 10) : '';
    const pcoEndsStr = pcoEndsAt ? pcoEndsAt.slice(0, 10) : '';
    const isCustomDate = Boolean(
      (customConfig.startDate && customConfig.startDate !== pcoStartsStr) ||
      (customConfig.endDate && customConfig.endDate !== pcoEndsStr)
    );

    let totalReceivedCents = 0;
    let donorsCount = 0;

    if (!isCustomDate) {
      // Use Planning Center's officially computed live campaign totals directly
      totalReceivedCents = pcoTotalReceivedCents;
    } else if (fundId) {
      try {
        const donationsSnap = await db.collection('donations')
          .where('churchId', '==', churchId)
          .where('fundId', '==', fundId)
          .get();

        if (!donationsSnap.empty) {
          const uniqueDonors = new Set<string>();
          donationsSnap.docs.forEach(d => {
            const data = d.data();
            const donationDate = (data.date || '').slice(0, 10);
            const afterStart = !effectiveStartDate || donationDate >= effectiveStartDate;
            const beforeEnd = !effectiveEndDate || donationDate <= effectiveEndDate;
            if (afterStart && beforeEnd) {
              totalReceivedCents += Math.round((data.amount || 0) * 100);
              if (data.donorId && data.donorId !== 'anonymous') {
                uniqueDonors.add(data.donorId);
              }
            }
          });
          donorsCount = uniqueDonors.size;
        } else {
          const sinceDate = effectiveStartDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
          let url = `https://api.planningcenteronline.com/giving/v2/donations?where[received_at][gte]=${sinceDate}&include=designations&per_page=100`;
          if (effectiveEndDate) {
            url += `&where[received_at][lte]=${effectiveEndDate}T23:59:59Z`;
          }
          const liveDonations = await fetchAllFromPco(churchId, url, 10);
          const liveIncluded = liveDonations.included || [];
          const uniqueLiveDonors = new Set<string>();

          (liveDonations.data || []).forEach((d: any) => {
            const donorId = d.relationships?.person?.data?.id;
            const donationDate = (d.attributes?.received_at || '').slice(0, 10);
            const afterStart = !effectiveStartDate || donationDate >= effectiveStartDate;
            const beforeEnd = !effectiveEndDate || donationDate <= effectiveEndDate;
            if (afterStart && beforeEnd) {
              const designationRefs = d.relationships?.designations?.data || [];
              designationRefs.forEach((ref: any) => {
                const des = liveIncluded.find((i: any) => i.type === 'Designation' && String(i.id) === String(ref.id));
                if (des && des.relationships?.fund?.data?.id === fundId) {
                  totalReceivedCents += des.attributes?.amount_cents || 0;
                  if (donorId) uniqueLiveDonors.add(donorId);
                }
              });
            }
          });
          donorsCount = uniqueLiveDonors.size;
        }
      } catch (e) {
        console.warn(`[publicApi] Error calculating donations for fund ${fundId}:`, e);
      }

      if (totalReceivedCents === 0 && !customConfig.startDate && !customConfig.endDate) {
        totalReceivedCents = pcoTotalReceivedCents;
      }
    }

    const churchCenterUrl = subdomain
      ? `https://${subdomain}.churchcenter.com/giving?campaign=${c.id}${fundId ? `&fund_id=${fundId}` : ''}`
      : `https://churchcenter.com/giving`;

    const campaign = {
      id: c.id,
      name: c.attributes?.name || 'Unnamed Campaign',
      description: c.attributes?.description || '',
      startDate: effectiveStartDate || null,
      endDate: effectiveEndDate || null,
      pcoStartsAt,
      pcoEndsAt,
      startsAt: effectiveStartDate || pcoStartsAt,
      endsAt: effectiveEndDate || pcoEndsAt,
      goalCents: c.attributes?.goal_cents || 0,
      goalCurrency: c.attributes?.goal_currency || 'USD',
      showGoalInChurchCenter: c.attributes?.show_goal_in_church_center ?? true,
      showProgressInChurchCenter: c.attributes?.show_progress_in_church_center ?? true,
      fundId: fundId || null,
      fundName: fundObj?.attributes?.name || 'General Fund',
      churchCenterUrl,
      totalPledgedCents,
      pledgeCount,
      totalReceivedCents,
      donorsCount,
      progressBasis: customConfig.progressBasis || 'both',
      imageUrl: customConfig.imageUrl || null,
      bannerUrl: customConfig.bannerUrl || null,
      headline: customConfig.headline || '',
      storyMarkdown: customConfig.storyMarkdown || '',
      graphicStyle: customConfig.graphicStyle || 'progress_bar',
      colorTheme: customConfig.colorTheme || 'indigo',
      showMetrics: customConfig.showMetrics || {
        goal: true,
        pledged: true,
        received: true,
        percent: true,
        pledgers: true,
        daysLeft: true,
      },
      milestones: customConfig.milestones || [],
      allowOnlinePledging: customConfig.allowOnlinePledging !== false,
      givingEmbedMode: customConfig.givingEmbedMode || 'modal',
      givingButtonText: customConfig.givingButtonText || 'Give to Campaign',
      pledgeButtonText: customConfig.pledgeButtonText || 'Pledge Now',
    };

    res.json(campaign);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function submitPublicPledge(req: any, res: any) {
  const { churchId, campaignId } = req.params;
  const { firstName, lastName, email, phone, amount, frequency, jointGiverType, notes } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Valid pledge amount is required.' });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  const db = getDb();
  const submissionId = `pledge_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const amountCents = Math.round(parseFloat(amount) * 100);

  try {
    // 1. Search for existing person in PCO People by email or phone
    let personId: string | null = null;
    let isNewPerson = false;

    if (email) {
      try {
        const searchRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/people/v2/emails?where[address]=${encodeURIComponent(email.trim())}`);
        if (searchRes.data && searchRes.data.length > 0) {
          personId = searchRes.data[0].relationships?.person?.data?.id || null;
        }
      } catch (err) {
        console.warn('[submitPublicPledge] Email search error:', err);
      }
    }

    if (!personId && phone) {
      try {
        const digitsOnly = phone.replace(/\D/g, '');
        const phoneRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/people/v2/phone_numbers?where[number]=${digitsOnly}`);
        if (phoneRes.data && phoneRes.data.length > 0) {
          personId = phoneRes.data[0].relationships?.person?.data?.id || null;
        }
      } catch (err) {
        console.warn('[submitPublicPledge] Phone search error:', err);
      }
    }

    // 2. If person not found, create new person in PCO People
    if (!personId) {
      isNewPerson = true;
      const createPersonRes = await fetchFromPco(
        churchId,
        'https://api.planningcenteronline.com/people/v2/people',
        'POST',
        {
          data: {
            type: 'Person',
            attributes: {
              first_name: firstName.trim(),
              last_name: lastName.trim()
            }
          }
        }
      );
      personId = createPersonRes.data?.id;
      if (!personId) throw new Error('Failed to create person record in Planning Center.');

      // Add email
      if (email) {
        try {
          await fetchFromPco(
            churchId,
            `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`,
            'POST',
            {
              data: {
                type: 'Email',
                attributes: { address: email.trim(), location: 'Home' }
              }
            }
          );
        } catch (e) {
          console.warn('[submitPublicPledge] Add email failed:', e);
        }
      }

      // Add phone
      if (phone) {
        try {
          await fetchFromPco(
            churchId,
            `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`,
            'POST',
            {
              data: {
                type: 'PhoneNumber',
                attributes: { number: phone.trim(), location: 'Mobile' }
              }
            }
          );
        } catch (e) {
          console.warn('[submitPublicPledge] Add phone failed:', e);
        }
      }
    }

    // 3. Create the Pledge in Planning Center Giving
    const pledgePayload = {
      data: {
        type: 'Pledge',
        attributes: {
          amount_cents: amountCents,
          joint_giver_type: jointGiverType || 'none'
        },
        relationships: {
          person: {
            data: {
              type: 'Person',
              id: personId
            }
          }
        }
      }
    };

    const pcoPledgeRes = await fetchFromPco(
      churchId,
      `https://api.planningcenteronline.com/giving/v2/pledge_campaigns/${campaignId}/pledges`,
      'POST',
      pledgePayload
    );

    const pcoPledgeId = pcoPledgeRes.data?.id || null;

    // 4. Save submission record in Firestore for logging and quick queries
    const submissionRecord = {
      id: submissionId,
      churchId,
      campaignId,
      firstName,
      lastName,
      email: email || '',
      phone: phone || '',
      amount: parseFloat(amount),
      amountCents,
      frequency: frequency || 'one_time',
      jointGiverType: jointGiverType || 'none',
      notes: notes || '',
      personId,
      isNewPerson,
      pcoPledgeId,
      submittedAt: Date.now(),
      status: 'synced_to_pco'
    };

    await db.collection('pledge_submissions').doc(submissionId).set(submissionRecord);

    // Invalidate cache
    delete cache[`${churchId}_pledge_campaigns`];

    res.json({
      success: true,
      submissionId,
      pcoPledgeId,
      personId,
      message: `Pledge of $${parseFloat(amount).toLocaleString()} successfully recorded in Planning Center!`
    });
  } catch (e: any) {
    console.error('[submitPublicPledge] Error:', e);
    try {
      await db.collection('pledge_submissions').doc(submissionId).set({
        id: submissionId,
        churchId,
        campaignId,
        firstName,
        lastName,
        email: email || '',
        phone: phone || '',
        amount: parseFloat(amount) || 0,
        amountCents,
        frequency: frequency || 'one_time',
        notes: notes || '',
        submittedAt: Date.now(),
        status: 'failed_pco_sync',
        error: e.message
      });
    } catch (saveErr) {
      // Ignore
    }
    res.status(500).json({ error: e.message || 'Failed to submit pledge to Planning Center' });
  }
}

export async function savePledgeCampaignConfig(req: any, res: any) {
  const { churchId, campaignId } = req.params;
  const config = req.body;

  try {
    const db = getDb();
    await db.collection('churches').doc(churchId).collection('pledge_campaign_configs').doc(campaignId).set({
      ...config,
      updatedAt: Date.now()
    }, { merge: true });

    delete cache[`${churchId}_pledge_campaigns`];

    res.json({ success: true, message: 'Campaign configuration saved successfully.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPledgeSubmissions(req: any, res: any) {
  const { churchId, campaignId } = req.params;
  try {
    const db = getDb();
    let q = db.collection('pledge_submissions').where('churchId', '==', churchId);
    if (campaignId && campaignId !== 'all') {
      q = q.where('campaignId', '==', campaignId);
    }
    const snap = await q.orderBy('submittedAt', 'desc').limit(100).get();
    const submissions = snap.docs.map(d => d.data());
    res.json(submissions);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function serveWidgetScript(req: any, res: any) {
  res.setHeader('Content-Type', 'application/javascript');
  
  const scriptContent = `
(function() {
  var currentScript = document.currentScript;
  if (!currentScript) {
      console.warn('PCO Widget: currentScript not found. Ensure script is not loaded dynamically in a way that obscures it.');
      return;
  }
  
  var scriptUrl = new URL(currentScript.src);
  var iframeParams = new URLSearchParams(scriptUrl.search);
  var widgetType = iframeParams.get('type');
  
  if (widgetType === 'bubble_form') {
      var color = iframeParams.get('color') || 'indigo';
      var formId = iframeParams.get('formId');
      var churchId = iframeParams.get('churchId');
      var bubbleMode = iframeParams.get('bubbleMode') || 'text';
      var bubbleText = iframeParams.get('bubbleText') || 'Plan a Visit';
      var bubbleHoverText = iframeParams.get('bubbleHoverText');
      var bubbleIcon = iframeParams.get('bubbleIcon') || '👋';
      var bubblePosition = iframeParams.get('bubblePosition') || 'right';
      
      var colorMap = {
          'indigo': '#4F46E5', 'blue': '#2563EB', 'emerald': '#10B981', 'amber': '#F59E0B',
          'red': '#EF4444', 'violet': '#8B5CF6', 'fuchsia': '#D946EF', 'rose': '#F43F5E'
      };
      var btnColor = colorMap[color] || '#4F46E5';
      
      var style = document.createElement('style');
      style.innerHTML = \`
        #pco-bubble-btn {
          position: fixed;
          bottom: 24px;
          \${bubblePosition === 'left' ? 'left: 24px;' : 'right: 24px;'}
          background-color: \${btnColor};
          color: white;
          border: none;
          \${bubbleMode === 'icon' ? 'border-radius: 50%; width: 60px; height: 60px; font-size: 28px; padding: 0;' : 'border-radius: 24px; padding: 12px 24px; font-size: 16px;'}
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          font-family: sans-serif;
          font-weight: bold;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #pco-bubble-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
        #pco-bubble-btn[data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          \${bubblePosition === 'left' ? 'left: 100%; margin-left: 16px;' : 'right: 100%; margin-right: 16px;'}
          top: 50%;
          transform: translateY(-50%);
          background: #1e293b;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          visibility: hidden;
        }
        #pco-bubble-btn[data-tooltip]:hover::after {
          opacity: 1;
          visibility: visible;
        }
        #pco-bubble-btn.pco-bubble-open-btn::after {
          display: none;
        }
        #pco-bubble-container {
          position: fixed;
          bottom: 90px;
          \${bubblePosition === 'left' ? 'left: 24px;' : 'right: 24px;'}
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 600px;
          max-height: calc(100vh - 120px);
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 999999;
          display: none;
          overflow: hidden;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.3s, transform 0.3s;
        }
        #pco-bubble-container.pco-bubble-open {
          display: block;
          opacity: 1;
          transform: translateY(0);
        }
        #pco-bubble-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      \`;
      document.head.appendChild(style);
      
      var container = document.createElement('div');
      container.id = 'pco-bubble-container';
      
      var iframe = document.createElement('iframe');
      iframe.id = 'pco-bubble-iframe';
      iframe.src = scriptUrl.origin + '/form/' + churchId + '/' + formId + '?embedded=true';
      iframe.allow = 'clipboard-write';
      container.appendChild(iframe);
      
      var btn = document.createElement('button');
      btn.id = 'pco-bubble-btn';
      btn.innerHTML = bubbleMode === 'icon' ? bubbleIcon : bubbleText;
      if (bubbleHoverText) {
        btn.setAttribute('data-tooltip', bubbleHoverText);
      }
      
      var isOpen = false;
      function toggleBubble() {
        isOpen = !isOpen;
        if (isOpen) {
          container.classList.add('pco-bubble-open');
          btn.classList.add('pco-bubble-open-btn');
          btn.innerHTML = bubbleMode === 'icon' ? '✕' : 'Close';
        } else {
          container.classList.remove('pco-bubble-open');
          btn.classList.remove('pco-bubble-open-btn');
          setTimeout(function() {
            if (!isOpen) container.style.display = 'none';
          }, 300);
          container.style.opacity = '0';
          container.style.transform = 'translateY(20px)';
          btn.innerHTML = bubbleMode === 'icon' ? bubbleIcon : bubbleText;
        }
      }
      
      btn.addEventListener('click', toggleBubble);
      
      window.addEventListener('message', function(event) {
        if (event.data === 'close-pco-bubble' && isOpen) {
          toggleBubble();
        }
      });
      
      document.body.appendChild(container);
      document.body.appendChild(btn);

  } else {
      var iframe = document.createElement('iframe');
      var iframeId = 'pco-widget-' + Math.random().toString(36).substr(2, 9);
      
      iframeParams.set('widget', 'true');
      iframeParams.set('iframeId', iframeId);
      
      iframe.id = iframeId;
      iframe.src = scriptUrl.origin + '/?' + iframeParams.toString();
      iframe.style.width = '100%';
      iframe.style.height = '600px'; 
      iframe.style.border = 'none';
      iframe.style.borderRadius = '12px';
      iframe.style.overflow = 'hidden';
      iframe.allow = 'clipboard-write';
      
      window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'pco-widget-resize' && e.data.iframeId === iframeId) {
          iframe.style.height = e.data.height + 'px';
        }
      });

      currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
  }
})();
  `;
  res.send(scriptContent);
}
