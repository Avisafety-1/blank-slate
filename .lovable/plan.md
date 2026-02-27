

## Problem

In `CompanyManagementSection.tsx` line 660, a `<SelectItem value="">` is used for the "all companies" option. Radix UI Select does not allow empty string values on SelectItem.

## Fix

### `src/components/admin/CompanyManagementSection.tsx` (line 660)

Change `value=""` to `value="__all__"` and update the corresponding `onValueChange` handler to treat `"__all__"` the same as empty string (i.e., no company filter).

- `<SelectItem value="__all__">Master-nøkkel (alle)</SelectItem>`
- In the `onValueChange`, map `"__all__"` back to `""` or `null` for the state variable

