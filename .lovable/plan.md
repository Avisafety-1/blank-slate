

## Problem

The function currently uses `https://graph.instagram.com/v22.0` for all API calls. The Instagram Content Publishing API actually requires `https://graph.facebook.com/v22.0` for the media container creation and publish endpoints - even when using "Instagram Login" tokens.

The `graph.instagram.com` domain is primarily for basic display / token operations, not content publishing.

## Plan

**File: `supabase/functions/publish-instagram/index.ts`**

1. Change `IG_API` to `https://graph.facebook.com/v22.0` for the publishing endpoints (`/{userId}/media` and `/{userId}/media_publish`)
2. Keep `https://graph.instagram.com/v22.0` only for the token exchange endpoint (`/access_token`) since that's where `ig_exchange_token` lives
3. Keep the `/me` verification call on `graph.facebook.com` as well (works on both)
4. Deploy the updated function

Also update `publish-scheduled/index.ts` which already uses `graph.facebook.com` for Instagram publishing - this is actually correct, so no change needed there.

## Technical Detail

```text
Before:  graph.instagram.com/v22.0/{userId}/media
After:   graph.facebook.com/v22.0/{userId}/media

Token exchange stays on: graph.instagram.com/access_token
```

