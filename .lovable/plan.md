

## Problem

Koden bruker `graph.facebook.com` for media container og publish, men siden vi bruker "Instagram Login"-flyten (med `instagram_business_basic` / `instagram_business_content_publish`), skal alle kall gå mot `graph.instagram.com` i henhold til dokumentasjonen.

I tillegg viser Meta-dokumentasjonen at API-et foretrekker JSON body med `Authorization: Bearer`-header fremfor URL-encoded params med access_token i body.

## Plan

**File: `supabase/functions/publish-instagram/index.ts`**

1. Endre alle publiserings-endepunkter tilbake til `graph.instagram.com`
2. Bytte fra URL-encoded form body til JSON body med `Authorization: Bearer` header for container creation og publish
3. Beholde token exchange på `graph.instagram.com` (som allerede er riktig)
4. Deploy funksjonen

### Endringer i detalj

```text
Before:
  POST graph.facebook.com/v22.0/{userId}/media  (form-encoded, token in body)
  POST graph.facebook.com/v22.0/{userId}/media_publish  (form-encoded, token in body)

After:
  POST graph.instagram.com/v22.0/{userId}/media  (JSON body, Bearer header)
  POST graph.instagram.com/v22.0/{userId}/media_publish  (JSON body, Bearer header)
```

**Container creation:**
```typescript
const containerRes = await fetch(`${IG_API}/${userId}/media`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ACCESS_TOKEN}`,
  },
  body: JSON.stringify({
    image_url: imageUrl,
    caption: text || "",
  }),
});
```

**Publish:**
```typescript
const publishRes = await fetch(`${IG_API}/${userId}/media_publish`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ACCESS_TOKEN}`,
  },
  body: JSON.stringify({
    creation_id: creationId,
  }),
});
```

**/me verification** -- also switch to Bearer header on `graph.instagram.com`.

Same changes applied to `publish-scheduled/index.ts` for the Instagram path.

