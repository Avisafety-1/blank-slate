# Mål
En administrator i en moravdeling skal kunne slette (og redigere) nyheter publisert av en underavdeling — ikke bare nyheter i sin egen `company_id`.

# Problem
RLS-policyene `Admins can delete news in own company` og `Admins can update news in own company` på `public.news` begrenser til `company_id = get_user_company_id(auth.uid())`. Det blokkerer moravdelingens admin fra å slette nyheter fra barneavdelinger, selv om de allerede ser dem (SELECT-policyen bruker `get_user_visible_company_ids`).

# Endring (migration)
Erstatte de to admin-policyene slik at admin/saksbehandler kan slette og oppdatere nyheter i alle selskaper de har hierarkisk innsyn i:

```sql
DROP POLICY "Admins can delete news in own company" ON public.news;
DROP POLICY "Admins can update news in own company" ON public.news;

CREATE POLICY "Admins can delete news in visible companies"
ON public.news FOR DELETE
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'saksbehandler'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);

CREATE POLICY "Admins can update news in visible companies"
ON public.news FOR UPDATE
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'saksbehandler'::app_role))
  AND company_id = ANY (get_user_visible_company_ids(auth.uid()))
);
```

Superadmin-tilgang dekkes allerede separat (uendret). Ingen frontend-endringer — `NewsDetailDialog` viser allerede slett-knappen til alle `isAdmin`-brukere, RLS var eneste blokker.
