

## Fix: DJI auto-sync resets on company save

### Root cause
In `CompanyManagementDialog.tsx`, the `onSubmit` function sets `dji_flightlog_enabled: inheritedDjiEnabled` in the update payload. `inheritedDjiEnabled` is initialized to `false` and only updated when creating a new child company (`isCreating && parentId`). When editing an existing company, this always writes `false` to the database.

### Fix (single change)
**File: `src/components/admin/CompanyManagementDialog.tsx`**

Remove `dji_flightlog_enabled` from the update payload when editing an existing company. It should only be included when creating.

Change the `companyData` construction (lines 186-199) so that `dji_flightlog_enabled` is only included in the object when `isCreating`:

```typescript
const companyData: any = {
  navn: data.navn,
  selskapstype: data.selskapstype,
  org_nummer: data.org_nummer || null,
  adresse: data.adresse || null,
  adresse_lat: data.adresse_lat || null,
  adresse_lon: data.adresse_lon || null,
  kontakt_epost: data.kontakt_epost || null,
  kontakt_telefon: data.kontakt_telefon || null,
  stripe_exempt: inheritedStripeExempt,
  parent_company_id: parentId,
  departments_enabled: departmentsEnabled,
};

if (isCreating) {
  companyData.dji_flightlog_enabled = inheritedDjiEnabled;
}
```

This ensures existing DJI settings are preserved when editing a company.

