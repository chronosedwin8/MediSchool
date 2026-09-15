-- 0004 — A tenant may update its own row (settings, name, compliance country).
-- Creating or moving rows to another tenant still requires the system context.
DROP POLICY IF EXISTS tenant_self ON core.tenants;
CREATE POLICY tenant_self_read ON core.tenants FOR SELECT USING (core.rls_bypass() OR id = core.current_tenant());
CREATE POLICY tenant_self_update ON core.tenants FOR UPDATE USING (core.rls_bypass() OR id = core.current_tenant()) WITH CHECK (core.rls_bypass() OR id = core.current_tenant());
CREATE POLICY tenant_system_insert ON core.tenants FOR INSERT WITH CHECK (core.rls_bypass());
CREATE POLICY tenant_system_delete ON core.tenants FOR DELETE USING (core.rls_bypass());
