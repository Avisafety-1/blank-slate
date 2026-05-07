## Mål

1. Når en **Avisafe-superadmin** inviterer en bruker til selskap X, skal vi (Avisafe) kunne **godkjenne** brukeren direkte fra Avisafe-selskapet (uten å bytte til X via CompanySwitcher).
2. Avisafe-superadmins skal **få e-postvarsel** når en slik bruker registrerer seg.
3. Hvis brukeren er invitert av selskap X sin egen admin (ikke Avisafe), skal Avisafe **ikke** få varsel og **ikke** se godkjenningen — kun X sin egen admin (og ev. parent-admin) som i dag.

I dag lagres ikke "hvem inviterte" noe sted — invite-user sender bare en e-post med selskapets `registration_code`. Vi må derfor spore invitasjonene.

---

## Endringer

### 1. Ny tabell `public.user_invitations` (migrasjon)

```
id uuid pk
email text not null
target_company_id uuid → companies(id)
invited_by uuid → auth.users(id)            -- hvem som klikket "Inviter"
inviter_company_id uuid → companies(id)     -- selskapet inviteren tilhørte
registration_code text                      -- koden som ble sendt
created_at timestamptz default now()
accepted_at timestamptz                     -- settes når brukeren registreres
accepted_user_id uuid → profiles(id)
```

RLS:
- SELECT: superadmin i Avisafe (alltid) + admins i `target_company_id` eller dens parent.
- INSERT: kun via edge function (service role) — ingen direkte policy.

Indekser: `(email, target_company_id)`, `(target_company_id, accepted_at)`.

### 2. `invite-user` edge function

Etter at e-posten er sendt, `INSERT INTO user_invitations` med:
- `email`, `target_company_id` (= selskapet `registrationCode` peker til), `invited_by = user.id`, `inviter_company_id = profile.company_id`, `registration_code`.

### 3. Trigger ved registrering

`AFTER INSERT ON profiles`-trigger `link_invitation_on_signup()`:
- Finn nyeste matchende rad i `user_invitations` (`email = NEW.email`, `target_company_id = NEW.company_id`, `accepted_at is null`).
- Oppdater `accepted_at = now()`, `accepted_user_id = NEW.id`.

### 4. `send-notification-email` — `notify_admins_new_user`-grenen

Etter eksisterende admin-utvelgelse, sjekk:
```
SELECT i.* FROM user_invitations i
JOIN profiles p ON p.id = i.invited_by
JOIN companies c ON c.id = p.company_id
JOIN user_roles r ON r.user_id = i.invited_by
WHERE i.target_company_id = <new user company>
  AND i.email = <new user email>
  AND r.role = 'superadmin'
  AND c.navn ILIKE 'avisafe'
ORDER BY i.created_at DESC LIMIT 1;
```

Hvis treff → legg til alle Avisafe-superadmins (godkjente, med `email_new_user_pending = true`) i `notificationUserIds`.

Hvis ikke treff → uendret oppførsel (kun selskapets/parents admins varsles, Avisafe får **ingenting**).

### 5. Frontend — Admin.tsx

For Avisafe-superadmins, legg til en ny seksjon **"Inviterte ventende godkjenning (på tvers av selskap)"** over eksisterende "Ventende godkjenning":
- Hent profiler `approved=false` der det finnes en `user_invitations`-rad med `invited_by = current Avisafe superadmin user` (eller bredere: `inviter_company_id = avisafe_company_id`).
- Vis: navn, e-post, **målselskap** (badge), invitert dato.
- Knapp **"Godkjenn"** kaller `approveUser(profile.id)` — men siden RLS på `profiles UPDATE` krever admin i målselskapet, må godkjenningen gå via en ny edge function `approve-invited-user` (service role) som verifiserer at innloggede er Avisafe-superadmin OG at det finnes en matchende `user_invitations`-rad. Den setter `approved=true`, `approved_at`, `approved_by`, og kaller `send-user-approved-email` som i dag.

Vanlige selskapsadmins ser **ikke** denne seksjonen — de ser bare sine egne ventende som før.

### 6. PendingApprovalsBadge

Ingen endring for vanlige admins. For Avisafe-superadmins: badge teller også Avisafe-inviterte ventende på tvers av selskap (samme spørring som seksjonen over).

---

## Hva som IKKE endres

- Eksisterende invitasjoner fra selskapets egen admin → samme flyt, samme varsler, ingen Avisafe-involvering.
- `notify_admins_new_user`-malen og parent-admin-varslingen for vanlige selskap.
- CompanySwitcher-flyten (Avisafe kan fortsatt bytte og godkjenne manuelt der).

---

## Teknisk oppsummering

- 1 migrasjon: `user_invitations` + RLS + trigger `link_invitation_on_signup`.
- `invite-user` edge function: legg til INSERT etter sending.
- `send-notification-email` edge function: utvid `notify_admins_new_user` med Avisafe-superadmin-sjekk.
- Ny edge function `approve-invited-user` (service role).
- `Admin.tsx` + `PendingApprovalsBadge.tsx`: ny seksjon/teller for Avisafe-superadmins.
