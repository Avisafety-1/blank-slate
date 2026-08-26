
CREATE POLICY "Visible company users can manage mission_personnel"
ON public.mission_personnel FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_personnel.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_personnel.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Visible company users can manage mission_drones"
ON public.mission_drones FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_drones.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_drones.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Visible company users can manage mission_equipment"
ON public.mission_equipment FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_equipment.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_equipment.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Visible company users can manage mission_documents"
ON public.mission_documents FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_documents.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_documents.mission_id AND m.company_id = ANY (public.get_user_visible_company_ids(auth.uid()))));
