/**
 * HubSpot Helper - Background Service Worker
 * Handles messaging between popup and content scripts
 */

console.log('[HubSpot Helper] Service worker starting...');

// Check if URL is a HubSpot page
function isHubSpotUrl(url) {
  return url && url.includes('hubspot.com');
}

// Listen for tab activation - disable sidepanel for non-HubSpot tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !isHubSpotUrl(tab.url)) {
      await chrome.sidePanel.setOptions({ tabId: activeInfo.tabId, enabled: false });
    }
  } catch (err) {
    // Ignore errors for special tabs
  }
});

// Listen for tab URL changes - disable sidepanel when navigating away from HubSpot
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && !isHubSpotUrl(changeInfo.url)) {
    try {
      await chrome.sidePanel.setOptions({ tabId: tabId, enabled: false });
    } catch (err) {
      // Ignore errors
    }
  }
});

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    initializeSampleData();
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log('[HubSpot Helper] Extension icon clicked, tab:', tab.id, tab.url);

  if (!isHubSpotUrl(tab.url)) {
    console.log('[HubSpot Helper] Not a HubSpot page');
    return;
  }

  // Store flag to open settings tab (icon click = settings)
  chrome.storage.local.set({ sidepanelOpenTab: 'settings' });

  // Open sidepanel
  chrome.sidePanel.open({ tabId: tab.id })
    .then(() => console.log('[HubSpot Helper] Side panel opened via icon'))
    .catch(err => console.error('[HubSpot Helper] Error opening side panel:', err));
});

// Initialize sample rules and plays
async function initializeSampleData() {
  const sampleRules = [
    {
      id: 'rule_test_always',
      name: 'Test Banner (Always Shows)',
      title: 'HubSpot Helper is Working!',
      message: 'This test banner confirms the extension is running. You can delete this rule in the extension popup.',
      type: 'success',
      enabled: true,
      priority: 100,
      objectTypes: [], // Empty = all object types
      conditions: [], // Empty = always matches
      logic: 'AND',
      createdAt: Date.now()
    },
    {
      id: 'rule_sample_1',
      name: 'Missing Next Steps',
      title: 'Action Required: Add Next Steps',
      message: 'This deal is missing next steps. Adding clear next steps improves close rates by 30%.',
      type: 'warning',
      enabled: true,
      priority: 10,
      objectTypes: ['deal'],
      conditions: [
        { property: 'next_step', operator: 'is_empty', value: '' }
      ],
      logic: 'AND',
      createdAt: Date.now()
    },
    {
      id: 'rule_sample_2',
      name: 'High Value Deal Alert',
      title: 'High Value Opportunity',
      message: 'This is a high-value deal. Consider involving a senior AE or solution engineer.',
      type: 'info',
      enabled: true,
      priority: 20,
      objectTypes: ['deal'],
      conditions: [
        { property: 'amount', operator: 'greater_than', value: '50000' }
      ],
      logic: 'AND',
      createdAt: Date.now()
    },
    {
      id: 'rule_sample_3',
      name: 'Competitor Mentioned',
      title: 'Competitor Play Available',
      message: 'A competitor was mentioned. Check the plays for talking points.',
      type: 'battle-card',
      enabled: true,
      priority: 15,
      conditions: [
        { property: 'competitor', operator: 'is_not_empty', value: '' }
      ],
      logic: 'AND',
      actions: [
        { type: 'card', label: 'View Play' }
      ],
      createdAt: Date.now()
    }
  ];

  const sampleBattleCards = [
    {
      id: 'card_competitor_1',
      name: 'vs. Competitor A',
      subtitle: 'Enterprise CRM competitor',
      cardType: 'competitor',
      conditions: [
        { property: 'competitor', operator: 'contains', value: 'competitor a' }
      ],
      sections: [
        {
          title: 'Their Strengths',
          content: '- Strong brand recognition\n- Large partner ecosystem\n- Extensive customization options'
        },
        {
          title: 'Their Weaknesses',
          content: '- Complex implementation (6-12 months avg)\n- High total cost of ownership\n- Requires dedicated admin'
        },
        {
          title: 'Our Differentiators',
          content: '- Faster time to value (weeks, not months)\n- More intuitive user experience\n- Better pricing transparency\n- Superior customer support'
        },
        {
          title: 'Winning Questions',
          content: '- "What\'s your timeline for seeing ROI?"\n- "Who will manage the system day-to-day?"\n- "What\'s your budget for ongoing customization?"'
        }
      ],
      createdAt: Date.now()
    },
    {
      id: 'card_objection_1',
      name: 'Price Objection Handler',
      subtitle: 'Common objection response',
      cardType: 'objection',
      conditions: [],
      sections: [
        {
          title: 'When They Say',
          content: '"Your solution is too expensive" or "We can\'t afford this right now"'
        },
        {
          title: 'Understand First',
          content: '- "Help me understand - too expensive compared to what?"\n- "What budget range were you working with?"\n- "What would make this investment worthwhile?"'
        },
        {
          title: 'Reframe Value',
          content: '- Focus on ROI, not cost\n- Calculate cost of inaction\n- Break down to per-user/per-month\n- Highlight hidden costs of alternatives'
        },
        {
          title: 'Proof Points',
          content: '- Average customer sees 3x ROI in first year\n- 40% reduction in manual tasks\n- Reference: Acme Corp saved $200k/year'
        }
      ],
      createdAt: Date.now()
    },
    {
      id: 'card_process_1',
      name: 'Demo Best Practices',
      subtitle: 'Run effective demos',
      cardType: 'tip',
      objectType: 'deal',
      conditions: [
        { property: 'dealstage', operator: 'contains', value: 'demo' }
      ],
      sections: [
        {
          title: 'Before the Demo',
          content: '- Review the prospect\'s website and LinkedIn\n- Check previous notes and emails\n- Prepare 3 custom talking points\n- Test your demo environment'
        },
        {
          title: 'During the Demo',
          content: '- Start with discovery (5 min)\n- Show, don\'t tell (keep it interactive)\n- Focus on their use case, not features\n- Leave time for Q&A'
        },
        {
          title: 'After the Demo',
          content: '- Send summary email within 2 hours\n- Include recording link\n- Propose clear next steps\n- Set follow-up reminder'
        }
      ],
      createdAt: Date.now()
    }
  ];

  const sampleWikiEntries = [
    {
      id: 'wiki_mql',
      term: 'MQL',
      aliases: ['Marketing Qualified Lead', 'marketing qualified lead'],
      category: 'marketing',
      definition: '<p><strong>Marketing Qualified Lead (MQL)</strong></p><p>A lead that has been identified as more likely to become a customer compared to other leads, based on marketing engagement.</p><ul><li>Has engaged with marketing content</li><li>Meets basic demographic criteria</li><li>Shows intent signals but hasn\'t been qualified by sales</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_sql',
      term: 'SQL',
      aliases: ['Sales Qualified Lead', 'sales qualified lead'],
      category: 'sales',
      definition: '<p><strong>Sales Qualified Lead (SQL)</strong></p><p>A lead that has been qualified by the sales team as having genuine potential to become a customer.</p><ul><li>Has budget and authority</li><li>Has a clear need and timeline</li><li>Has been vetted through discovery</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_acv',
      term: 'ACV',
      aliases: ['Annual Contract Value', 'annual contract value'],
      category: 'sales',
      definition: '<p><strong>Annual Contract Value (ACV)</strong></p><p>The total annual revenue from a customer contract, normalized to a yearly basis.</p><p>Formula: Total Contract Value / Contract Term in Years</p><p>Example: A 3-year, $90,000 deal has an ACV of $30,000.</p>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_arr',
      term: 'ARR',
      aliases: ['Annual Recurring Revenue', 'annual recurring revenue'],
      category: 'sales',
      definition: '<p><strong>Annual Recurring Revenue (ARR)</strong></p><p>The value of recurring revenue normalized to a one-year period. This is a key metric for subscription-based businesses.</p><p>ARR = MRR x 12</p>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_pipeline',
      term: 'Pipeline',
      aliases: ['Sales Pipeline', 'sales pipeline', 'deal pipeline'],
      category: 'sales',
      definition: '<p><strong>Sales Pipeline</strong></p><p>A visual representation of where prospects are in the sales process. The pipeline shows deals at each stage from initial contact to closed won.</p><p>Key stages typically include:</p><ul><li>Prospecting</li><li>Qualification</li><li>Demo/Proposal</li><li>Negotiation</li><li>Closed Won/Lost</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    },
    {
      id: 'wiki_discovery',
      term: 'Discovery',
      aliases: ['Discovery Call', 'discovery call', 'Discovery Meeting'],
      category: 'process',
      definition: '<p><strong>Discovery Call</strong></p><p>An initial sales conversation focused on understanding the prospect\'s needs, challenges, and goals.</p><p>Key elements:</p><ul><li>Understand their current situation</li><li>Identify pain points and challenges</li><li>Determine budget and timeline</li><li>Identify decision makers</li></ul>',
      link: '',
      enabled: true,
      createdAt: Date.now()
    }
  ];

  await chrome.storage.local.set({
    rules: sampleRules,
    battleCards: sampleBattleCards,
    wikiEntries: sampleWikiEntries,
    settings: {
      enabled: true,
      showBanners: true,
      showBattleCards: true,
      showWiki: true,
      bannerPosition: 'top',
      theme: 'light'
    }
  });

  console.log('[HubSpot Helper] Sample data initialized');
}

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getProperties') {
    // Forward to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getProperties' })
          .then(sendResponse)
          .catch(() => sendResponse(null));
      } else {
        sendResponse(null);
      }
    });
    return true;
  }

  if (request.action === 'refreshUI') {
    // Tell content script to refresh
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url?.includes('hubspot.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'refresh' }).catch(() => {});
      }
    });
    return false;
  }

  // Forward card updates to sidepanel
  if (request.action === 'updateSidePanelCards') {
    // The sidepanel should receive this directly, but log it for debugging
    console.log('[HubSpot Helper] Card update received, cards:', request.cards?.length);
    return false;
  }

  // Open the side panel (from FAB click)
  if (request.action === 'openSidePanel') {
    console.log('[HubSpot Helper] Received openSidePanel request from tab:', sender.tab?.id);
    // Set flag to open plays tab (FAB click = plays) - do this sync
    chrome.storage.local.set({ sidepanelOpenTab: 'plays' });
    // Open side panel synchronously in response to user gesture
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => console.log('[HubSpot Helper] Side panel opened successfully'))
        .catch(err => console.error('[HubSpot Helper] Error opening side panel:', err));
    }
    return false;
  }

  // Fetch Deal properties from HubSpot API
  if (request.action === 'fetchDealProperties') {
    fetchHubSpotDeal(request.portalId, request.dealId)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  // Fetch properties for an object type
  if (request.action === 'fetchObjectProperties') {
    fetchHubSpotProperties(request.objectType)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Fetch Deal from HubSpot API
async function fetchHubSpotDeal(portalId, dealId) {
  console.log('[HubSpot Helper BG] Fetching deal:', dealId);

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    console.log('[HubSpot Helper BG] No API token configured');
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  console.log('[HubSpot Helper BG] Token found, making request...');

  // First, get all available deal properties
  let propertyNames = [];
  try {
    const propsUrl = `https://api.hubapi.com/crm/v3/properties/deals`;
    const propsResponse = await fetch(propsUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (propsResponse.ok) {
      const propsData = await propsResponse.json();
      propertyNames = propsData.results.map(p => p.name);
      console.log('[HubSpot Helper BG] Found', propertyNames.length, 'deal properties');
    }
  } catch (e) {
    console.log('[HubSpot Helper BG] Could not fetch property list, using defaults');
    propertyNames = ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', 'pipeline', 'closedate'];
  }

  // Fetch the deal with all properties
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${propertyNames.join(',')}`;
  console.log('[HubSpot Helper BG] Fetching deal with', propertyNames.length, 'properties');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('[HubSpot Helper BG] Response status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.log('[HubSpot Helper BG] Error response:', errText);
    throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[HubSpot Helper BG] Success, got', Object.keys(data.properties || {}).length, 'properties');
  return data;
}

// Fetch properties for a HubSpot object type
async function fetchHubSpotProperties(objectType) {
  console.log('[HubSpot Helper BG] Fetching properties for:', objectType);

  const { settings } = await chrome.storage.local.get({ settings: {} });
  const apiToken = settings.hubspotApiToken;

  if (!apiToken) {
    throw new Error('HubSpot API token not configured. Add it in extension settings.');
  }

  const url = `https://api.hubapi.com/crm/v3/properties/${objectType}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();

  // Return simplified property list: name, label, type, options
  return data.results.map(prop => ({
    name: prop.name,
    label: prop.label,
    type: prop.type,
    fieldType: prop.fieldType,
    options: prop.options || [],
    groupName: prop.groupName
  })).sort((a, b) => a.label.localeCompare(b.label));
}

// Badge update when rules match
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rules) {
    // Could update badge count here
  }
});
