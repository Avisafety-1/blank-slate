

## Plan: Legg til `user_invite` som synlig maltype i e-postmal-editoren

### Endringer i `src/components/admin/EmailTemplateEditor.tsx`

**1. Legg til default template-innhold i `defaultTemplateContent` (etter linje 384, før `};`)**
- Ny nøkkel `user_invite` med HTML-mal som matcher den i `template-utils.ts` — inneholder `{{company_name}}`, `{{registration_code}}`, `{{app_url}}`

**2. Legg til i `basicTemplateTypes` (etter `customer_welcome`, linje 418)**
- Ny entry:
  - value: `user_invite`
  - label: `Inviter ny bruker`
  - variables: `{{company_name}}`, `{{registration_code}}`, `{{app_url}}`
  - defaultSubject: `Du er invitert til {{company_name}}`
  - previewData med eksempeldata

### Fil som endres
- `src/components/admin/EmailTemplateEditor.tsx`

