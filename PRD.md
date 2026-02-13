# Product Requirements Document: Support Helpdesk Application

## Executive Summary
Build a production-ready support helpdesk web application that integrates with Gmail for email management, uses Supabase as the backend, and provides a complete ticket management system for support teams.

---

## 1. Technical Stack

### Frontend
- **Framework**: React 18+ with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context + Hooks
- **Routing**: React Router v6
- **HTTP Client**: Fetch API / Axios
- **Icons**: Lucide React
- **Date Handling**: date-fns

### Backend
- **Backend-as-a-Service**: Supabase
  - PostgreSQL Database
  - Authentication
  - Real-time subscriptions
  - Row Level Security (RLS)
  - Storage for attachments

### Third-Party APIs
- **Gmail API**: Google APIs Node.js Client
- **OAuth 2.0**: Google OAuth for Gmail authentication

---

## 2. Project Structure

```
helpdesk-app/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── tickets/
│   │   │   │   ├── TicketList.tsx
│   │   │   │   ├── TicketDetail.tsx
│   │   │   │   ├── TicketMessage.tsx
│   │   │   │   ├── ReplyBox.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   ├── customers/
│   │   │   │   ├── CustomerHistory.tsx
│   │   │   │   └── CustomerInfo.tsx
│   │   │   ├── analytics/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   └── StatsCard.tsx
│   │   │   └── settings/
│   │   │       ├── GmailIntegration.tsx
│   │   │       ├── TeamMembers.tsx
│   │   │       └── Templates.tsx
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   ├── TicketContext.tsx
│   │   │   └── GmailContext.tsx
│   │   ├── hooks/
│   │   │   ├── useTickets.ts
│   │   │   ├── useGmail.ts
│   │   │   └── useSupabase.ts
│   │   ├── services/
│   │   │   ├── supabase.ts
│   │   │   ├── gmail.ts
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   ├── ticket.ts
│   │   │   ├── customer.ts
│   │   │   └── message.ts
│   │   ├── utils/
│   │   │   ├── formatters.ts
│   │   │   └── validators.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/
│   ├── supabase/
│   │   ├── migrations/
│   │   │   ├── 001_create_customers.sql
│   │   │   ├── 002_create_tickets.sql
│   │   │   ├── 003_create_messages.sql
│   │   │   ├── 004_create_team_members.sql
│   │   │   ├── 005_create_templates.sql
│   │   │   ├── 006_create_gmail_sync.sql
│   │   │   └── 007_setup_rls.sql
│   │   └── functions/
│   │       ├── create-ticket-from-email/
│   │       ├── send-gmail-reply/
│   │       └── sync-gmail-emails/
│   └── .env.example
│
├── docs/
│   ├── SETUP.md
│   ├── DEPLOYMENT.md
│   └── API.md
│
└── README.md
```

---

## 3. Database Schema (Supabase PostgreSQL)

### 3.1 Customers Table
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
```

### 3.2 Tickets Table
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category VARCHAR(100),
  assigned_to UUID REFERENCES auth.users(id),
  gmail_thread_id VARCHAR(255),
  gmail_message_id VARCHAR(255),
  tags TEXT[],
  due_date TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  first_response_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tickets_customer ON tickets(customer_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_gmail_thread ON tickets(gmail_thread_id);
```

### 3.3 Messages Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  content TEXT NOT NULL,
  html_content TEXT,
  is_customer BOOLEAN DEFAULT true,
  is_internal_note BOOLEAN DEFAULT false,
  gmail_message_id VARCHAR(255),
  attachments JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_ticket ON messages(ticket_id);
CREATE INDEX idx_messages_created ON messages(created_at);
```

### 3.4 Team Members Table
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.5 Templates Table
```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  content TEXT NOT NULL,
  category VARCHAR(100),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.6 Gmail Sync Table
```sql
CREATE TABLE gmail_sync (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  email_address VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expiry TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  history_id VARCHAR(255),
  watch_expiration TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.7 SLA Tracking Table
```sql
CREATE TABLE sla_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  first_response_sla INTEGER, -- minutes
  resolution_sla INTEGER, -- minutes
  first_response_breached BOOLEAN DEFAULT false,
  resolution_breached BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4. Row Level Security (RLS) Policies

### Enable RLS on all tables
```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Policy: Team members can read all data
CREATE POLICY "Team members can read all"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
      AND team_members.is_active = true
    )
  );

-- Policy: Team members can update tickets
CREATE POLICY "Team members can update tickets"
  ON tickets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
      AND team_members.is_active = true
    )
  );

-- Similar policies for other tables...
```

---

## 5. Core Features

### 5.1 Authentication & Authorization
- **Supabase Auth** with email/password
- Role-based access control (Admin, Agent, Viewer)
- Protected routes based on user role
- Session management

### 5.2 Gmail Integration
**Requirements:**
- OAuth 2.0 authentication with Google
- Read emails from Gmail inbox
- Send replies through Gmail
- Archive emails after ticket creation
- Mark emails as read
- Sync email threads
- Handle attachments
- Real-time sync using Gmail Push Notifications (optional)

**Implementation Steps:**
1. Set up Google Cloud Project
2. Enable Gmail API
3. Configure OAuth 2.0 credentials
4. Store refresh tokens securely in Supabase
5. Create Supabase Edge Functions for:
   - Fetching emails
   - Sending replies
   - Syncing threads
   - Archiving emails

### 5.3 Ticket Management
**Features:**
- Auto-create tickets from incoming emails
- Manual ticket creation
- Ticket search and filtering
- Status management (Open, Pending, Resolved, Closed)
- Priority levels (Low, Medium, High, Urgent)
- Category/tag assignment
- Ticket assignment to team members
- Due date tracking
- Bulk actions (assign, change status, etc.)

### 5.4 Customer Management
**Features:**
- Customer profile with contact information
- Complete ticket history per customer
- Customer notes
- Last contact tracking
- Automatic customer creation from email

### 5.5 Messaging System
**Features:**
- Threaded conversation view
- Rich text editor for replies
- Internal notes (not visible to customers)
- File attachments
- Email notifications
- Read receipts
- Time tracking per message

### 5.6 Team Collaboration
**Features:**
- Team member management
- Ticket assignment
- Internal notes and mentions
- Activity log
- Collision detection (when multiple agents view same ticket)

### 5.7 Analytics Dashboard
**Metrics:**
- Total tickets (open, pending, resolved, closed)
- Average response time
- Average resolution time
- Tickets per agent
- Customer satisfaction ratings
- SLA compliance
- Tickets by category/priority
- Trend charts (daily/weekly/monthly)

### 5.8 Templates & Automation
**Features:**
- Canned responses/templates
- Auto-assign rules based on keywords
- Auto-tag based on content
- Auto-response for common queries
- Escalation rules for overdue tickets

### 5.9 Notifications
**Features:**
- In-app notifications
- Email notifications for:
  - New ticket assignment
  - Customer reply
  - Status changes
  - Mentions
  - SLA breaches

---

## 6. Supabase Edge Functions

### 6.1 Gmail Sync Function
```typescript
// supabase/functions/sync-gmail-emails/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  )

  // 1. Get Gmail credentials from gmail_sync table
  // 2. Fetch unread emails using Gmail API
  // 3. For each email:
  //    - Create/find customer
  //    - Create ticket
  //    - Create message
  //    - Mark email as read
  //    - Store gmail_thread_id and gmail_message_id
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  )
})
```

### 6.2 Send Gmail Reply Function
```typescript
// supabase/functions/send-gmail-reply/index.ts

serve(async (req) => {
  const { ticketId, message, to } = await req.json()
  
  // 1. Get Gmail credentials
  // 2. Get ticket gmail_thread_id
  // 3. Send reply using Gmail API
  // 4. Store sent message in messages table
  // 5. Update ticket updated_at timestamp
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  )
})
```

### 6.3 Archive Gmail Email Function
```typescript
// supabase/functions/archive-gmail-email/index.ts

serve(async (req) => {
  const { gmailMessageId } = await req.json()
  
  // 1. Get Gmail credentials
  // 2. Remove INBOX label using Gmail API
  // 3. Update ticket status if needed
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  )
})
```

---

## 7. Environment Variables

### Frontend (.env)
```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback
```

### Supabase Edge Functions (.env)
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

---

## 8. Key User Flows

### 8.1 First-Time Setup Flow
1. User signs up / logs in via Supabase Auth
2. User navigates to Settings → Gmail Integration
3. Click "Connect Gmail Account"
4. Redirect to Google OAuth consent screen
5. User authorizes Gmail access
6. Callback receives authorization code
7. Exchange code for refresh token
8. Store refresh token in `gmail_sync` table
9. Trigger initial email sync
10. Display success message

### 8.2 Incoming Email → Ticket Flow
1. Email arrives in Gmail inbox
2. Gmail Push Notification triggers webhook (or scheduled sync runs)
3. Edge function fetches new emails
4. For each email:
   - Parse sender email and name
   - Find or create customer record
   - Generate unique ticket number (TKT-XXXX)
   - Create ticket with subject, status='open', priority='medium'
   - Store gmail_thread_id and gmail_message_id
   - Create first message in messages table
   - Mark email as read in Gmail (optional)
5. Real-time update via Supabase subscriptions
6. Ticket appears in agent dashboard
7. Send notification to assigned agent (if auto-assigned)

### 8.3 Agent Reply Flow
1. Agent opens ticket detail
2. Agent types reply in ReplyBox component
3. Agent clicks "Send Reply"
4. Frontend calls Supabase Edge Function `send-gmail-reply`
5. Edge function:
   - Retrieves Gmail credentials
   - Sends email via Gmail API with thread_id
   - Creates message record (is_customer=false)
   - Updates ticket.updated_at
6. Real-time update shows new message
7. Email sent via Gmail appears in customer's inbox

### 8.4 Archive Ticket Flow
1. Agent marks ticket as resolved/closed
2. Frontend calls archive function
3. Edge function removes INBOX label from Gmail thread
4. Email moved to "All Mail" in Gmail
5. Ticket status updated to closed

---

## 9. UI Components Specification

### 9.1 Ticket List Component
- Display tickets in a scrollable list
- Show ticket number, subject, customer name, status badge, priority indicator
- Show last updated time
- Highlight selected ticket
- Support filtering by status
- Support search by ticket number, subject, customer

### 9.2 Ticket Detail Component
- Display full ticket information in header
- Show customer info with link to history
- Status change buttons (Open, Pending, Resolved, Closed)
- Priority dropdown
- Assigned agent dropdown
- Category/tags multiselect
- Scrollable message thread
- Reply box at bottom
- Attachment support

### 9.3 Reply Box Component
- Textarea for message content
- Send button
- Attachment button
- Internal note toggle
- Character count
- Template dropdown

### 9.4 Customer History Component
- List all tickets for a customer
- Show status, date, subject
- Click to navigate to ticket
- Summary stats (total tickets, avg resolution time)

### 9.5 Analytics Dashboard
- 4 stat cards: Total, Open, Pending, Resolved
- Recent activity feed
- Chart for tickets over time
- Breakdown by category
- Agent performance table

---

## 10. API Integration Details

### 10.1 Supabase Client Setup
```typescript
// src/services/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 10.2 Real-time Subscriptions
```typescript
// Subscribe to new tickets
supabase
  .channel('tickets')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'tickets' },
    (payload) => {
      // Add new ticket to state
    }
  )
  .subscribe()

// Subscribe to new messages
supabase
  .channel('messages')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      // Add message to current ticket
    }
  )
  .subscribe()
```

### 10.3 Gmail API Integration
```typescript
// src/services/gmail.ts
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
)

export async function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ]
  })
}

export async function exchangeCodeForTokens(code: string) {
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}
```

---

## 11. Additional Features (Nice-to-Have)

### 11.1 Knowledge Base Integration
- Link help articles to tickets
- Suggest articles based on ticket content
- Customer self-service portal

### 11.2 Customer Satisfaction (CSAT)
- Send satisfaction survey after ticket resolution
- Track CSAT scores
- Display ratings in analytics

### 11.3 Multi-Channel Support
- Integrate with Slack
- Integrate with WhatsApp
- Live chat widget for website

### 11.4 Advanced Automation
- AI-powered auto-categorization
- Sentiment analysis
- Smart reply suggestions
- Duplicate ticket detection

### 11.5 Reporting
- Export tickets to CSV
- Custom report builder
- Scheduled email reports

### 11.6 Mobile App
- React Native mobile app
- Push notifications
- Quick reply functionality

---

## 12. Security Considerations

### 12.1 Data Protection
- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Implement rate limiting
- Validate all inputs
- Sanitize HTML content in messages

### 12.2 Authentication Security
- Use Supabase Auth with secure password requirements
- Implement MFA (Multi-Factor Authentication)
- Session timeout after inactivity
- Secure token storage

### 12.3 Gmail Security
- Store refresh tokens encrypted
- Rotate access tokens regularly
- Implement token revocation
- Limit OAuth scopes to minimum required

---

## 13. Performance Optimization

### 13.1 Frontend
- Lazy load components
- Implement virtual scrolling for large ticket lists
- Optimize images and assets
- Use React.memo for expensive components
- Implement debouncing for search

### 13.2 Backend
- Index database tables appropriately
- Implement caching for frequently accessed data
- Use pagination for large datasets
- Optimize SQL queries
- Implement connection pooling

### 13.3 Gmail API
- Batch API requests where possible
- Implement exponential backoff for rate limiting
- Cache email content
- Use partial responses to reduce payload size

---

## 14. Testing Requirements

### 14.1 Unit Tests
- Test utility functions
- Test custom hooks
- Test API service functions

### 14.2 Integration Tests
- Test Supabase queries
- Test Gmail API integration
- Test Edge functions

### 14.3 E2E Tests
- Test complete user flows
- Test Gmail sync process
- Test ticket creation and reply

---

## 15. Deployment Checklist

### 15.1 Pre-Deployment
- [ ] Set up Supabase project
- [ ] Run all migrations
- [ ] Configure RLS policies
- [ ] Deploy Edge functions
- [ ] Set up Google Cloud project and OAuth
- [ ] Configure environment variables
- [ ] Test Gmail integration thoroughly

### 15.2 Deployment
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Configure custom domain
- [ ] Set up SSL certificates
- [ ] Configure CORS
- [ ] Set up monitoring and logging

### 15.3 Post-Deployment
- [ ] Test all features in production
- [ ] Monitor error logs
- [ ] Set up backup strategy
- [ ] Document API endpoints
- [ ] Create user documentation

---

## 16. Success Metrics

- **User Adoption**: Number of active team members
- **Response Time**: Average first response time < 2 hours
- **Resolution Time**: Average resolution time < 24 hours
- **Customer Satisfaction**: CSAT score > 90%
- **Ticket Volume**: Number of tickets processed per day
- **SLA Compliance**: % of tickets meeting SLA > 95%
- **System Uptime**: 99.9% availability

---

## 17. Future Enhancements (Phase 2)

1. AI-powered chatbot for common queries
2. Video call integration for complex issues
3. Customer portal for ticket tracking
4. Multi-language support
5. Advanced workflow automation
6. Custom fields for tickets
7. API for third-party integrations
8. White-label solution for multi-tenant

---

## 18. Implementation Priority

### Phase 1 (MVP - 4 weeks)
1. Set up Supabase project and database schema
2. Implement authentication
3. Build ticket list and detail views
4. Gmail OAuth integration
5. Basic email sync (read emails)
6. Send replies via Gmail
7. Customer management
8. Basic analytics

### Phase 2 (2 weeks)
1. Templates and canned responses
2. Team member management
3. Internal notes
4. File attachments
5. Advanced filtering and search
6. Notifications

### Phase 3 (2 weeks)
1. SLA tracking
2. Automation rules
3. Advanced analytics
4. Mobile responsiveness
5. Performance optimization
6. Testing and bug fixes

---

## 19. Technical Constraints

- **Gmail API Quota**: 250 quota units per user per second
- **Supabase Free Tier**: 500 MB database, 1 GB file storage, 2 GB bandwidth
- **Real-time connections**: Max 200 concurrent connections (Supabase free tier)
- **Edge Functions**: Max 500K invocations/month (free tier)

---

## 20. Conclusion

This PRD provides a comprehensive blueprint for building a production-ready support helpdesk application with Gmail integration and Supabase backend. The application should be scalable, secure, and user-friendly, providing support teams with all necessary tools to manage customer inquiries efficiently.

Follow the phased implementation approach to deliver an MVP quickly, then iterate with additional features based on user feedback and business requirements.