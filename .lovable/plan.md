

# Fjern enhetsnavn-steget fra passkey-registrering

## Endring

**`src/components/PasskeySetup.tsx`**:
- Fjern `showNameInput`-state og `deviceName`-state
- Fjern hele navn-input-seksjonen (linje 192–216)
- «Legg til passkey»-knappen kaller `handleRegister` direkte
- `handleRegister` bruker `getDefaultDeviceName()` automatisk (iPhone, Android, Mac, etc.)
- Fjern `Input`/`Label`-imports som ikke lenger trengs

Resultatet: Ett klikk → biometri-prompt → ferdig.

