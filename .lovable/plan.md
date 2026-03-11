

## AviSafe Visual Generator — Plan

### Summary
Add a "Visuelt" section to the Marketing module with AI-powered image generation, screenshot upload/framing, layout templates, and draft integration. Uses Gemini image generation via Lovable AI Gateway.

### Database Changes

**New table: `marketing_media`**
```sql
CREATE TABLE public.marketing_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  draft_id UUID REFERENCES public.marketing_drafts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL DEFAULT 'image', -- 'image', 'graphic'
  layout_template TEXT, -- 'feature_highlight', 'safety_tip_card', etc.
  source_type TEXT NOT NULL DEFAULT 'ai', -- 'screenshot', 'ai', 'graphic'
  file_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  image_format TEXT DEFAULT '1200x1200', -- '1200x1200', '1200x628'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```
RLS: company_id based, same pattern as other marketing tables.

**New storage bucket: `marketing-media`** (public, for generated images).

### New Edge Function

**`supabase/functions/marketing-visual/index.ts`**
- Uses `google/gemini-3-pro-image-preview` for high-quality image generation
- Three modes:
  - `type: "safety_graphic"` — generates safety concept illustrations (wind limits, buffer zones, risk zones)
  - `type: "product_mockup"` — generates device mockups with AviSafe UI descriptions
  - `type: "screenshot_layout"` — takes uploaded screenshot URL + headline/subtitle, generates a framed marketing layout
- All prompts include AviSafe branding rules (neutral aviation palette, clean SaaS design, minimalistic, no cartoons)
- Returns base64 image → edge function uploads to `marketing-media` bucket → returns public URL
- Accepts `format: "1200x1200" | "1200x628"` for LinkedIn sizing

### New UI Components

**`src/components/marketing/MarketingVisuals.tsx`** — New section page
- Grid of generated visuals from `marketing_media` table
- "Generate visual" button opens VisualGeneratorDialog
- Delete, download, attach-to-draft actions per visual

**`src/components/marketing/VisualGeneratorDialog.tsx`** — Main generator dialog
- Visual type selector (Safety Graphic / Product Mockup / Screenshot Layout)
- Layout template selector (Feature highlight, Safety tip card, Product update, Dashboard highlight, Mission planning)
- Screenshot upload zone (for Screenshot Layout type)
- Text inputs: headline, subtitle
- Format selector (LinkedIn square 1200×1200, LinkedIn landscape 1200×628)
- Generate button → shows loading → preview of result
- Save to media library / Attach to draft

**`src/components/marketing/VisualPreview.tsx`** — LinkedIn post preview
- Shows draft text + visual in a LinkedIn-style card preview
- Displays how the final post would appear

### Draft Integration Changes

**`src/components/marketing/DraftEditorDialog.tsx`** — Add visual section
- New collapsible "Visuelt" section at the bottom
- Shows attached media (from `marketing_media` where `draft_id` matches)
- Buttons: "Generer visuell", "Last opp skjermbilde", "Fjern visuell"
- Inline preview of attached visual
- LinkedIn post preview button

### Sidebar Update

**`src/components/marketing/MarketingSidebar.tsx`** — Add "Visuelt" nav item with Image icon

**`src/pages/Marketing.tsx`** — Add `visuals` section rendering

### Layout Templates (constant in marketingPresets.ts)

```typescript
export const VISUAL_TEMPLATES = [
  { id: "feature_highlight", label: "Feature Highlight" },
  { id: "safety_tip_card", label: "Safety Tip Card" },
  { id: "product_update", label: "Product Update Visual" },
  { id: "dashboard_highlight", label: "Aviation Dashboard" },
  { id: "mission_planning", label: "Drone Mission Planning" },
];
```

### Architecture

```text
VisualGeneratorDialog
  ├─ Type selector (safety_graphic / product_mockup / screenshot_layout)
  ├─ Template selector (5 templates)
  ├─ Screenshot upload (for screenshot_layout type)
  ├─ Headline + subtitle inputs
  ├─ Format selector (square / landscape)
  └─ Generate → marketing-visual edge function
        ├─ Builds prompt with AviSafe brand rules
        ├─ Calls Gemini image generation
        ├─ Uploads result to marketing-media bucket
        └─ Returns public URL → saved to marketing_media table
```

### Files

**Create:**
- `supabase/functions/marketing-visual/index.ts`
- `src/components/marketing/MarketingVisuals.tsx`
- `src/components/marketing/VisualGeneratorDialog.tsx`
- `src/components/marketing/VisualPreview.tsx`

**Modify:**
- `src/components/marketing/MarketingSidebar.tsx` — add "Visuelt" section
- `src/pages/Marketing.tsx` — add visuals rendering
- `src/components/marketing/DraftEditorDialog.tsx` — add visual attachment section
- `src/components/marketing/marketingPresets.ts` — add VISUAL_TEMPLATES
- `supabase/config.toml` — add marketing-visual function config

