

## Plan: Add Default Flight Geography Area to Company Settings

### What changes
Add a new company-level setting for "Standard Flight Geography Area" (in meters) alongside the existing "Standard SORA-buffersone" setting. This default value will be used when initializing SORA settings for new routes.

### Database
Add column `default_flight_geography_m` (integer, default 0) to `company_sora_config` table.

### UI Changes

**`src/components/admin/ChildCompaniesSection.tsx`**
- Add state `defaultFlightGeographyM` (number, default 0)
- Fetch it alongside `default_buffer_mode` from `company_sora_config`
- Add a new UI block inside the SORA buffer section (after the buffer mode radio group): a slider (0-200m) with label "Standard Flight Geography Area (m)" and current value display
- Save via upsert to `company_sora_config` on change

### Consumer Changes

**`src/pages/Kart.tsx`**
- Fetch `default_flight_geography_m` alongside `default_buffer_mode` from `company_sora_config`
- Use it as the initial `flightGeographyDistance` value in `soraSettings` (instead of hardcoded 0)

**`src/components/dashboard/ExpandedMapDialog.tsx`**
- Same: apply company default for `flightGeographyDistance` in the default SORA settings

### Summary of files
1. **Migration**: Add `default_flight_geography_m` column
2. **ChildCompaniesSection.tsx**: New slider UI + save logic
3. **Kart.tsx**: Read and apply default
4. **ExpandedMapDialog.tsx**: Read and apply default

