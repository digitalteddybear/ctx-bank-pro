# Zero-Trust HubSpot CRM Integration Permission Matrix & Deployment Guide

**Target Version**: CTX Sovereign Engine v1.0 / Next.js 16 App Router  
**Target Launch Scope**: Day 1 Phase 1 — Fixed 25-Lead Pilot  
**Operator**: Dylan (`dylan@aspinvest.co.uk`)  
**Security Status**: Fail-Closed Active (`HUBSPOT_WRITES_ENABLED=false`)  
**Auditing**: Append-Only SQLite (`data/generated/outreach/hubspot_audit.sqlite`)

---

## 1. Architecture Overview

The CTX HubSpot CRM integration is engineered according to a **Zero-Trust Model**. In traditional architectures, an agent or application is given a broadly-scoped API token and directly mutates the CRM. In CTX, the AI runtime, prompt contexts, client bundles, and background agents **never possess or see** the HubSpot API token.

All CRM updates flow through a deterministic gateway located at:
- **TypeScript Module**: [`src/lib/server/integrations/hubspot-gateway.ts`](file:///Users/ziggy/local-agents/ctx-engineering/App/knowledge-network/src/lib/server/integrations/hubspot-gateway.ts)
- **Isolated Microservice Endpoint**: [`src/app/api/integrations/hubspot/route.ts`](file:///Users/ziggy/local-agents/ctx-engineering/App/knowledge-network/src/app/api/integrations/hubspot/route.ts)
- **Immutable Allowlist**: [`src/lib/server/integrations/hubspot-allowlist.ts`](file:///Users/ziggy/local-agents/ctx-engineering/App/knowledge-network/src/lib/server/integrations/hubspot-allowlist.ts)
- **Append-Only Audit Log**: [`src/lib/server/integrations/hubspot-audit.ts`](file:///Users/ziggy/local-agents/ctx-engineering/App/knowledge-network/src/lib/server/integrations/hubspot-audit.ts)

```
┌─────────────────────────────────────────────────────────────┐
│                   AI Agent & LLM Runtime                    │
│   (No HubSpot credentials in prompt, tools, or memory)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Structured Workflow Event
                               ▼
┌─────────────────────────────────────────────────────────────┐
│         Workflow Engine (src/lib/server/outreach/engine.ts)  │
│         - Validates Human Operator Approval                 │
│         - Verifies State Machine Transition                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│          Deterministic Zero-Trust HubSpot Gateway           │
│ 1. Verify Contact ID in Fixed 25-Lead Allowlist             │
│ 2. Verify Email strictly matches Contact ID record           │
│ 3. Enforce Strict Zod Schema (Reject arbitrary properties)  │
│ 4. Check Idempotency via messageId in SQLite Audit Trail    │
│ 5. Check Kill-Switch: HUBSPOT_WRITES_ENABLED === "true"     │
└───────────────┬─────────────────────────────┬───────────────┘
                │ Dry-Run / Blocked           │ Live (if enabled)
                ▼                             ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│ SQLite Audit Trail           │ │ HubSpot CRM API            │
│ (hubspot_audit.sqlite)       │ │ - PATCH /crm/v3/contacts   │
│ - Zero secret leakage        │ │ - POST /crm/v3/objects/    │
│ - SHA-256 hashed emails      │ │        notes               │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 2. Permitted Operations Matrix

The gateway permits only three (3) strictly typed operations. Any other operation is rejected with an HTTP 403 / `DENIED_UNKNOWN_OPERATION`.

| Operation | HTTP Method | HubSpot API Endpoint | Permitted Fields / Payload | Trigger / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `updateOutreachStatus` | `PATCH` | `/crm/v3/objects/contacts/{hubspotId}` | `ctx_status`<br>`ctx_last_contact`<br>`ctx_booking_link_sent` | Stage transitions: `Queued`, `Dispatched`, `Follow-up Due`, `Interested`, `Booked`, `Opted Out`, `Disqualified` |
| `logEmailEngagement` | `POST` | `/crm/v3/objects/notes` + Contact Association | `subject`<br>`body`<br>`timestamp`<br>`direction: "OUTBOUND"` | Log sent outreach emails directly to the contact activity timeline |
| `logReplyEngagement` | `POST` | `/crm/v3/objects/notes` + Contact Association | `sentiment`<br>`snippet`<br>`timestamp`<br>`direction: "INBOUND"` | Log inbound prospect replies and sentiment classification |

---

## 3. Strict Deny & Enforcement Matrix

The gateway enforces fail-closed constraints across all CRM operations:

| Condition / Operation | Action Taken | HTTP / Gateway Status | Rationale |
| :--- | :--- | :--- | :--- |
| `DELETE` (any object) | **Strictly Blocked** | 403 Forbidden | Accidental data destruction impossible |
| Arbitrary HTTP requests | **Strictly Blocked** | 403 Forbidden | Prevents SSRF and unauthorized endpoint probing |
| Contact Creation (`POST /contacts`) | **Strictly Blocked** | 403 Forbidden | Launch restricted strictly to pre-approved 25 leads |
| Deal Creation (`POST /deals`) | **Strictly Blocked** | 403 Forbidden | Out of scope for cold outreach stage |
| Bulk / Batch Operations | **Strictly Blocked** | 403 Forbidden | Limits blast radius of any runtime anomaly |
| Non-allowlisted Contact ID | **Denied** (`DENIED_NOT_IN_ALLOWLIST`) | 403 Forbidden | Contacts outside the approved 25 cannot be modified |
| Email Mismatch | **Denied** (`DENIED_EMAIL_MISMATCH`) | 403 Forbidden | Prevents ID confusion or parameter swapping |
| Unauthorized Property Name | **Denied** (`DENIED_FIELD_UNAUTHORIZED`) | 403 Forbidden | Prevents tampering with CRM fields (e.g. `lifecyclestage`, `owner`) |
| Duplicate `messageId` | **Denied** (`DENIED_IDEMPOTENT_DUPLICATE`) | 403 Forbidden | Prevents duplicate notes and double status updates on retries |
| Missing Human Approval (`approvedBy`) | **Denied** (`DENIED_MALFORMED_PAYLOAD`) | 400 Bad Request | Audit compliance: all outreach writes require operator identity |
| Kill Switch Disabled (`HUBSPOT_WRITES_ENABLED=false`) | **Allowed Dry-Run** (`ALLOWED_DRY_RUN`) | 200 OK | Safe default: validates all logic and logs to SQLite without modifying CRM |

---

## 4. The 25 Approved Phase 1 Leads

The allowlist is statically compiled and frozen in [`hubspot-allowlist.ts`](file:///Users/ziggy/local-agents/ctx-engineering/App/knowledge-network/src/lib/server/integrations/hubspot-allowlist.ts). Any mutation to this array requires code review and passing CI gates.

| # | HubSpot Contact ID | Contact Name | Verified Normalized Email |
| :---: | :--- | :--- | :--- |
| 1 | `52991787848` | Alexandros Tsimikalis | `a.tsimikalis@hungrydonkey.co.uk` |
| 2 | `48024155473` | Abby Chambers | `abbychambers423@muchomail.com` |
| 3 | `56246795271` | Chloe Clarke | `abigail.clark-morgan@kcl.ac.uk` |
| 4 | `56247603516` | Rakhi B | `abrv1@europe.com` |
| 5 | `56248649130` | Omar Aldoori | `aby@aquabella.co.uk` |
| 6 | `59623239845` | Ajay Sharma | `ajaysharma@ireland.com` |
| 7 | `48020282435` | Akina Matsumoto | `akina_m38@hotmail.co.jp` |
| 8 | `48024952374` | Syed Aqeeluddin | `akku_1980@yahoo.co.in` |
| 9 | `238984016004` | Chris Hall | `alan@lladderedge.ndo.co.uk` |
| 10 | `48023631778` | Alan Capewell | `alan@malvernplumber.co.uk` |
| 11 | `52967038083` | Alba Vivo | `alba@mycocotte.uk` |
| 12 | `52989560590` | Alejandra Karakadze | `alejandra@mber.london` |
| 13 | `52987933710` | Alexia Grehan | `alexia@pushdesignltd.com` |
| 14 | `48024165938` | Ali Beter | `ali.beter@hushmail.com` |
| 15 | `237985930606` | Alisdair Cameron | `alisdair.cameron@postoffice.co.uk` |
| 16 | `62055641349` | Alistair Stuart Gronbach | `alistair.gronbach@scottish-courage.co.uk` |
| 17 | `48024586351` | Mohamed Ali Hamad Alkarbi | `alkurbi@windowslive.com` |
| 18 | `56247355651` | Bernard Ryan Ryan | `alliedbs@eircom.net` |
| 19 | `56245781606` | Emma Briggs | `andi.briggs@beamglobal.com` |
| 20 | `238034725647` | Andre de Haes | `andre@backed.vc` |
| 21 | `59605883269` | Andreas Roller | `andreas_roller@web.de` |
| 22 | `239549025451` | Andre Bailey | `andrelbailey@live.co.uk` |
| 23 | `238995734162` | Andrew Flemming | `andrew.flemming@btopenworld.com` |
| 24 | `52991593336` | Andy Purvinis | `andrew@constructionlogisticsservices.com` |
| 25 | `59636788909` | Andrew Hale | `andrewahale@googlemail.com` |

---

## 5. HubSpot Setup Instructions for Dylan

To connect HubSpot with CTX for the 25-lead launch, follow these steps in your HubSpot portal:

### Step 1: Create a Scoped HubSpot Private App
1. In HubSpot, click the **Settings icon** (gear in top navigation).
2. In the left sidebar, navigate to **Integrations** > **Private Apps**.
3. Click **Create a private app**.
4. On the **Basic Info** tab:
   - **Name**: `CTX Sovereign Outreach Gateway`
   - **Description**: `Deterministic zero-trust integration for CTX automated outreach logging`
5. On the **Scopes** tab, select **ONLY** the following scopes:
   - `crm.objects.contacts.write` (to update custom contact properties)
   - `crm.objects.contacts.read` (to verify contact status)
   - *(Optional for notes)*: `crm.objects.custom.write` or engagement notes permissions if separated
   - **DO NOT SELECT**: `crm.objects.deals`, `crm.objects.companies`, `crm.lists`, `settings`, or delete permissions.
6. Click **Create app** and confirm.
7. Copy the generated **Access Token** (`pat-eu1-...` or `pat-na1-...`).

### Step 2: Configure Custom Contact Properties in HubSpot
Under **Settings** > **Data Management** > **Properties** > **Contact Properties**, create three properties:

1. **Property: `ctx_status`**
   - **Label**: `CTX Outreach Status`
   - **Group**: `Contact Information`
   - **Field Type**: `Dropdown select`
   - **Options**:
     - `Queued`
     - `Dispatched`
     - `Follow-up Due`
     - `Interested`
     - `Booked`
     - `Opted Out`
     - `Disqualified`
2. **Property: `ctx_last_contact`**
   - **Label**: `CTX Last Contact Date`
   - **Group**: `Contact Information`
   - **Field Type**: `Date picker` or `Single-line text` (ISO timestamp)
3. **Property: `ctx_booking_link_sent`**
   - **Label**: `CTX Booking Link Sent`
   - **Group**: `Contact Information`
   - **Field Type**: `Single checkbox` (boolean: true/false)

### Step 3: Populate `.env.local`
In `App/knowledge-network/.env.local`:

```bash
# HubSpot Zero-Trust Configuration
HUBSPOT_ACCESS_TOKEN="pat-eu1-your-hubspot-token-here"

# Kill switch: KEEP AS false UNTIL LIVE OUTREACH IS OFFICIALLY AUTHORIZED
HUBSPOT_WRITES_ENABLED="false"

# Microservice authentication token (auto-generated)
HUBSPOT_GATEWAY_SHARED_SECRET="<generate with: npm run auth:generate>"
```

---

## 6. Pre-Flight Verification & Enabling Live Writes

Before flipping `HUBSPOT_WRITES_ENABLED="true"`:

1. Run the test suite:
   ```bash
   cd App/knowledge-network
   npm run qa:hubspot
   ```
   *All 10 security tests must pass.*

2. Run the complete CI regression suite:
   ```bash
   npm run qa:ci
   ```
   *Typecheck, Auth QA, HubSpot QA, Outreach QA, Orchestrator QA, and LangSmith Red-Team gate must all pass (100%).*

3. Flip the kill switch in `.env.local`:
   ```bash
   HUBSPOT_WRITES_ENABLED="true"
   ```

4. Verify live writes via the SQLite audit trail:
   ```bash
   sqlite3 data/generated/outreach/hubspot_audit.sqlite "SELECT timestamp, operation, hubspot_id, decision, status, http_status FROM hubspot_audit_log ORDER BY timestamp DESC LIMIT 5;"
   ```
   *Confirm `decision = 'ALLOWED_LIVE'` and `status = 'applied'`.*
