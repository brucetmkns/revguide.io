# AI Chat Feature - Development Specification

This document outlines the implementation plan for adding an AI-powered "Chat" tab to the RevGuide sidepanel.

---

## Overview

Add a third tab to the sidepanel (alongside Plays and Settings) that provides:
1. **Smart suggestions** based on current record analysis (missing fields, content recommendations)
2. **Conversational AI** for answering questions about the record and knowledge base
3. **Field update execution** with user confirmation

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **AI Provider** | Two-tier system | RevGuide Credits (proprietary prompts) OR user's own API key (customizable) |
| **Proactivity** | Subtle hints | Badge shows suggestion count; doesn't auto-display messages |
| **Permissions** | Suggest + Execute | Chat can suggest AND apply field updates after user confirmation |
| **Primary Provider** | Anthropic (Claude) | OpenAI available as alternative for own-key users |

---

## User Flows

### Flow 1: Smart Suggestions (Proactive)
```
1. User opens Chat tab
2. System analyzes current record (missing fields, matching content, relevant plays)
3. Badge shows "3 suggestions available"
4. User clicks badge → sees suggestion cards
5. User clicks a suggestion → inserts as chat message
```

### Flow 2: Conversational Query
```
1. User types: "What info can I send this client?"
2. AI queries knowledge base (plays, wiki, content libraries)
3. AI considers record context (industry, stage, properties)
4. AI responds: "Based on their Casino Marketing industry and Consideration stage,
   try the Ultimate Guide to Guest Experience. Want me to draft an email?"
```

### Flow 3: Field Update
```
1. User types: "Update the amount to $75,000"
2. AI parses intent → identifies field + value
3. AI responds: "I'll update Amount to $75,000"
4. Confirmation modal appears: [Amount → $75,000] [Cancel] [Apply]
5. User clicks Apply → HubSpot API call → page refreshes
```

---

## Two-Tier AI System

### RevGuide Credits Mode
- User purchases credit packs
- Proprietary system prompts (bundled, not exposed to user)
- Backend handles prompt injection
- User sees: "Using RevGuide AI"

### Own API Key Mode
- User enters their Anthropic or OpenAI API key
- User can customize system prompt
- Full transparency on prompt behavior
- User sees: "Using your Claude/GPT-4 key"

### Settings UI
```
AI Mode: (●) RevGuide Credits  ( ) Own API Key

[Own API Key selected:]
├── Provider: [Anthropic ▾]
├── API Key: [sk-ant-...      ]
└── Custom Instructions: [textarea]
    "Leave empty for default behavior"
```

---

## File Structure

### New Files
```
sidepanel/
└── modules/
    └── chat.js              # ChatModule class

background/
└── prompts/
    ├── system.js            # Bundled RevGuide system prompts
    └── analysis.js          # Record analysis prompts
```

### Modified Files
```
sidepanel/
├── sidepanel.html           # Add Chat tab button + content
├── sidepanel.js             # Initialize ChatModule
└── sidepanel.css            # Chat styles

background/
└── background.js            # AI API handlers

manifest.json                # API host permissions
```

---

## Data Structures

### AI Config (stored in settings)
```javascript
settings.aiConfig = {
  mode: 'revguide' | 'ownkey',
  provider: 'anthropic' | 'openai',
  apiKey: '',                    // Only for ownkey mode
  customSystemPrompt: ''         // Only for ownkey mode
}
```

### Chat Message
```javascript
{
  role: 'user' | 'assistant' | 'system' | 'error',
  content: 'Message text...',
  timestamp: Date.now(),
  suggestedUpdates: [            // Optional, for field updates
    { field: 'amount', fieldLabel: 'Amount', value: '75000' }
  ]
}
```

### Suggestion
```javascript
{
  type: 'missing_field' | 'content_recommendation' | 'relevant_play',
  priority: 'high' | 'medium' | 'low',
  title: 'Missing: Next Step',
  description: 'Add next steps to improve close rate',
  field: 'next_step',            // For missing_field type
  content: 'Ultimate Guide...',   // For content_recommendation type
  playId: 'card_xxx'             // For relevant_play type
}
```

---

## API Integration

### Anthropic Claude API
```javascript
// POST https://api.anthropic.com/v1/messages
{
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  system: systemPrompt,
  messages: [
    { role: 'user', content: '...' },
    { role: 'assistant', content: '...' }
  ]
}
```

### OpenAI API
```javascript
// POST https://api.openai.com/v1/chat/completions
{
  model: 'gpt-4-turbo-preview',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '...' },
    { role: 'assistant', content: '...' }
  ]
}
```

### Background Script Handlers
```javascript
// New message actions:
'chatCompletion'    // Send message to AI, get response
'analyzeRecord'     // Analyze record for smart suggestions
```

---

## ChatModule Class

### Constructor
```javascript
class ChatModule {
  constructor(sidepanel) {
    this.sidepanel = sidepanel;  // Reference to parent SidePanel
    this.messages = [];          // Chat history
    this.suggestions = [];       // Current suggestions
    this.pendingUpdates = null;  // Awaiting confirmation
    this.init();
  }
}
```

### Key Methods
| Method | Purpose |
|--------|---------|
| `init()` | Bind events, run initial analysis |
| `sendMessage()` | Send user input to AI |
| `analyzeRecordForSuggestions()` | Get badge count on load |
| `callAI(message)` | Send via background script |
| `showConfirmation(updates)` | Display field update modal |
| `applyUpdates()` | Execute HubSpot field updates |
| `addMessage(role, content)` | Add to chat history |
| `renderMessages()` | Render all messages to DOM |
| `updateSuggestionsBadge(count)` | Update tab badge |

---

## UI Components

### Chat Tab Button
```html
<button class="sidepanel-tab" data-tab="chat" title="AI Chat">
  <svg><!-- chat bubble icon --></svg>
  <span>Chat</span>
  <span class="chat-badge" id="chatTabBadge">3</span>
</button>
```

### Suggestions Indicator
```html
<div class="chat-suggestions">
  <button class="suggestions-trigger">
    <span>💡</span>
    <span>3 suggestions available</span>
    <svg><!-- chevron --></svg>
  </button>
  <div class="suggestions-list">
    <!-- Suggestion cards -->
  </div>
</div>
```

### Message Bubbles
```html
<div class="chat-message user">
  <div class="message-content">User message here</div>
</div>
<div class="chat-message assistant">
  <div class="message-content">AI response here</div>
</div>
```

### Input Area
```html
<div class="chat-input-area">
  <textarea placeholder="Ask about this record..."></textarea>
  <button class="chat-send-btn">
    <svg><!-- send icon --></svg>
  </button>
</div>
```

### Confirmation Modal
```html
<div class="chat-confirmation-overlay">
  <div class="chat-confirmation-modal">
    <h4>Update HubSpot Record?</h4>
    <div class="confirmation-changes">
      <div class="update-row">
        <span class="update-field">Amount</span>
        <span class="update-arrow">→</span>
        <span class="update-value">$75,000</span>
      </div>
    </div>
    <div class="confirmation-actions">
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-primary">Apply Changes</button>
    </div>
  </div>
</div>
```

---

## System Prompts

### RevGuide System Prompt (Proprietary)
```
You are an AI assistant helping HubSpot users manage their CRM records.
You have access to:
- Current record properties
- Available plays (battle cards)
- Wiki glossary terms
- Content libraries

Your goals:
1. Answer questions about the current record
2. Recommend relevant content based on industry, stage, and properties
3. Suggest field updates when appropriate
4. Always be helpful and concise

When suggesting field updates, format as JSON:
{
  "suggestedUpdates": [
    { "field": "api_name", "fieldLabel": "Display Name", "value": "new_value" }
  ]
}
```

### Analysis Prompt
```
Analyze this HubSpot record and return suggestions as JSON.

Check for:
1. Missing required fields that should be filled
2. Content that matches the record's industry/stage
3. Plays that match the current situation

Return format:
{
  "suggestions": [...],
  "greeting": "Hi [name], I noticed..."
}
```

---

## Security Considerations

### API Key Storage
- Keys stored in `chrome.storage.local` (encrypted at rest by Chrome)
- Keys only accessed in background script
- Never passed to sidepanel/content scripts
- Never sent to RevGuide backend (for own-key mode)

### Proprietary Prompt Protection
- Bundled in background script (not in inspectable DOM)
- Basic obfuscation (not true security)
- For real protection, would need backend proxy (future enhancement)

### HubSpot API Security
- All field updates require explicit user confirmation
- Uses existing `updateHubSpotProperties()` pattern
- Respects HubSpot API scopes

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Update manifest.json with API host permissions
- [ ] Add AI settings to sidepanel Settings tab
- [ ] Create bundled prompts files

### Phase 2: Background Handlers
- [ ] Add `chatCompletion` message handler
- [ ] Add `analyzeRecord` message handler
- [ ] Implement Anthropic API call
- [ ] Implement OpenAI API call
- [ ] Build knowledge base context function

### Phase 3: Chat Tab UI
- [ ] Add Chat tab HTML structure
- [ ] Add chat styles to CSS
- [ ] Create ChatModule class
- [ ] Implement message rendering
- [ ] Implement input handling

### Phase 4: Smart Suggestions
- [ ] Implement record analysis on tab open
- [ ] Render suggestion badge
- [ ] Render suggestion cards
- [ ] Handle suggestion clicks

### Phase 5: Field Updates
- [ ] Detect update intent in AI response
- [ ] Render confirmation modal
- [ ] Handle cancel/apply actions
- [ ] Execute HubSpot API update
- [ ] Refresh page on success

### Phase 6: Polish
- [ ] Error handling and retry logic
- [ ] Rate limiting
- [ ] Loading states
- [ ] Session persistence
- [ ] Accessibility (ARIA labels, keyboard nav)

---

## Example Interactions

### Missing Fields
```
Badge: "3 suggestions"

User clicks →
"Acme Corp is missing some key fields:
• Next Step (required for forecasting)
• Close Date (helps with pipeline reports)

Would you like me to suggest values based on the deal stage?"

User: "Yes"

AI: "Based on the 'Qualified to Buy' stage, I suggest:
• Next Step: Send proposal
• Close Date: [30 days from now]

Want me to update these?"

[Confirmation modal appears]
```

### Content Recommendation
```
User: "What can I send this client?"

AI: "Based on their **Casino Marketing** industry and **Consideration** stage,
I'd recommend:

1. **Ultimate Guide to Guest Experience** - matches their industry focus
2. **ROI Calculator Template** - good for consideration stage

Want me to draft an intro email for the first one?"
```

### Direct Field Update
```
User: "Set the deal amount to $50,000 and close date to next Friday"

AI: "I'll update those fields for you."

[Confirmation modal]
┌────────────────────────────────┐
│ Update HubSpot Record?         │
│                                │
│ Amount      → $50,000          │
│ Close Date  → Dec 20, 2024     │
│                                │
│        [Cancel] [Apply]        │
└────────────────────────────────┘

User clicks Apply → "Done! Refreshing the page..."
```

---

## Dependencies

### manifest.json Additions
```json
"host_permissions": [
  "https://api.anthropic.com/*",
  "https://api.openai.com/*"
]
```

### No New npm Packages
All functionality implemented with native browser APIs.

---

## Testing Checklist

- [ ] Chat tab appears and switches correctly
- [ ] AI settings save and persist
- [ ] RevGuide mode vs Own Key mode toggle works
- [ ] Anthropic API calls succeed with valid key
- [ ] OpenAI API calls succeed with valid key
- [ ] Suggestions badge updates on record load
- [ ] Suggestions expand/collapse correctly
- [ ] User messages render correctly
- [ ] AI responses render correctly
- [ ] Typing indicator shows during API call
- [ ] Error messages display for failures
- [ ] Confirmation modal shows for field updates
- [ ] Cancel closes modal without changes
- [ ] Apply updates HubSpot and refreshes page
- [ ] Works on Contacts, Companies, Deals, Tickets
- [ ] Handles "Not a HubSpot page" state
- [ ] Handles "AI not configured" state

---

## Future Enhancements

1. **Backend proxy for RevGuide mode** - True prompt security
2. **Conversation history persistence** - Resume chats across sessions
3. **Voice input** - Speech-to-text for hands-free
4. **Suggested responses** - Quick reply buttons
5. **Multi-turn context** - Better conversation memory
6. **Analytics** - Track usage and popular queries
7. **Custom actions** - Beyond field updates (create tasks, send emails)
