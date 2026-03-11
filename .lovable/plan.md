

## Improve Marketing AI Generation Quality

### Summary
Upgrade the marketing module's AI generation to produce structured, AviSafe-specific content with presets, brand voice rules, structured output, and review helpers. No database schema changes needed — the existing `metadata` JSONB column on `marketing_drafts` stores all structured fields.

### Files to modify

**1. `supabase/functions/marketing-ai/index.ts`** — Major rewrite
- Add comprehensive AviSafe brand voice system prompt (professional B2B tone, no hype, credibility-first rules)
- Add `type: "draft"` with structured tool-calling output returning: `title`, `hook`, `body`, `cta`, `hashtags`, `suggestedAudience`, `characterCount`, `whyItWorks`, `audienceFit`, `followUpVariation`
- Accept new params: `preset`, `structure`, `language`, `variantCount`
- Add `type: "ideas"` with preset-aware generation (safety tip, compliance tip, product update, etc.)
- Support `variantCount: 3` for multi-variant generation
- Support `language: "no" | "en"` with native-feeling output instructions
- Each preset maps to tone, audience, CTA style, hashtag style, and post structure guidance baked into the system prompt

**2. `src/components/marketing/DraftEditorDialog.tsx`** — Major rewrite
- Add preset selector (8 presets: Safety tip, Compliance tip, Product update, Feature announcement, Industry insight, Operational best practice, Incident learning, Founder update)
- Add structure selector (6 structures: Hook+insight+CTA, Problem+solution+CTA, Short educational, Product/news update, Thought leadership, Checklist/tips)
- Add language toggle (Norwegian / English)
- Display structured AI output in sections (hook, body, CTA, hashtags) instead of plain textarea
- Show review helper panel (why it works, audience fit, follow-up variation)
- Add "Regenerate" button, "Generate 3 variants" button
- Add "Save as template" button (saves to metadata with `isTemplate: true`)
- Store structured fields in the `metadata` JSONB column

**3. `src/components/marketing/MarketingDrafts.tsx`** — Minor additions
- Add "Duplicate" button per draft (copies to new draft)
- Show language badge if set in metadata

**4. `src/components/marketing/MarketingIdeas.tsx`** — Add preset selector
- Add preset dropdown to idea generation (generates ideas within a specific preset category)
- Improve "Convert to draft" to pre-select the matching preset

**5. `src/components/marketing/MarketingSettings.tsx`** — Extend with brand config
- Add editable brand voice rules section (textarea, saved to localStorage for now)
- Add banned phrases list
- Add preferred CTA style, hashtag style, default audiences per platform
- These settings are passed to the edge function when generating

### Presets definition (shared constant file)

**6. `src/components/marketing/marketingPresets.ts`** — New file
- Export `GENERATION_PRESETS` array with preset configs
- Export `POST_STRUCTURES` array
- Export `BRAND_VOICE_DEFAULTS` object
- Each preset: `{ id, label, tone, audience, ctaStyle, hashtagStyle, suggestedStructure }`

### Architecture

```text
DraftEditorDialog
  ├─ Preset selector → maps to tone/audience/CTA guidance
  ├─ Structure selector → maps to post structure
  ├─ Language toggle → no/en
  ├─ "Generate" / "Regenerate" / "3 Variants"
  │     └─ calls marketing-ai edge function with all params
  │           └─ returns structured { hook, body, cta, hashtags, review }
  ├─ Structured content display (editable sections)
  ├─ Review helper panel (collapsible)
  └─ Save → content + structured fields stored in metadata JSONB
```

No new database tables or migrations needed. All structured data fits in the existing `metadata` JSONB column.

