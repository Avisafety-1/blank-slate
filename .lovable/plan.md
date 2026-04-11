

## Plan: LinkedIn Publishing Integration for /marketing

### Overview
Add LinkedIn posting capability following the same pattern as Facebook/Instagram, but using LinkedIn's OAuth 2.0 (3-legged) flow since LinkedIn requires user-level authorization (unlike FB/IG which use page tokens).

### Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MarketingSettings │──>│ linkedin-oauth   │──>│ LinkedIn OAuth  │
│  (Connect button)  │<──│ (edge function)  │<──│ Authorization   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │ DB: encrypted │
                        │ tokens table  │
                        └──────────────┘
                              │
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MarketingDrafts  │──>│ publish-linkedin │──>│ LinkedIn REST   │
│  (Publish button) │<──│ (edge function)  │<──│ API /rest/posts │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Steps

**1. Add secrets** (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET)
- Client ID: `78ky284fr6x81w`
- Client secret: user will provide via secret tool

**2. Database migration**
- Create `linkedin_tokens` table (company_id, access_token encrypted, refresh_token encrypted, member_urn, expires_at, updated_at)
- RLS: only company members can read their own tokens

**3. Edge function: `linkedin-oauth`**
- Handles two actions: `authorize` (returns LinkedIn OAuth URL) and `callback` (exchanges code for tokens, stores encrypted in DB, fetches member URN via `/v2/userinfo`)
- Redirect URI: `https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/linkedin-oauth?action=callback`

**4. Edge function: `publish-linkedin`**
- Reads encrypted tokens from DB
- Posts to LinkedIn REST API (`/rest/posts`) with `w_member_social` scope
- Supports text-only and text+image posts (image requires upload via `/rest/images`)
- Updates draft status/metadata like FB/IG pattern

**5. Update `publish-scheduled`**
- Add LinkedIn branch for drafts with `platform === "linkedin"`

**6. Frontend updates**
- **MarketingSettings**: Change LinkedIn status from "Planlagt" to show a "Koble til LinkedIn" button + connection status
- **MarketingDrafts**: Add LinkedIn publish button (blue `#0A66C2`) next to FB/IG buttons for approved drafts; add LinkedIn link for published drafts
- **DraftEditorDialog**: Ensure "linkedin" is available as platform option (already is based on `createBlank`)

### Technical Details

- LinkedIn OAuth redirect URI must be registered in the LinkedIn app settings
- Tokens encrypted with `pgp_sym_encrypt` using existing `FH2_ENCRYPTION_KEY` pattern
- LinkedIn access tokens expire after 60 days; refresh tokens after 365 days
- Member URN format: `urn:li:person:XXXXXXX`
- Post creation payload: `{ author: memberUrn, lifecycleState: "PUBLISHED", visibility: "PUBLIC", commentary: text }`
- Image posts require: initializeUpload → upload binary → create post with image reference

