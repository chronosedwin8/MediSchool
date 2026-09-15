'use client';

import { PageHeader } from '@sgee/ui';
import { useState } from 'react';
import { AuditPanel } from '@/components/admin/audit';
import { CompliancePanel } from '@/components/admin/compliance';
import { IntegrationsPanel } from '@/components/admin/integrations';
import { NotificationsPanel } from '@/components/admin/notifications';
import { RolesPanel } from '@/components/admin/roles';
import { SettingsPanel } from '@/components/admin/settings';
import { StructurePanel } from '@/components/admin/structure';
import { SystemPanel } from '@/components/admin/system';
import { TenantsPanel } from '@/components/admin/tenants';
import { UsersPanel } from '@/components/admin/users';
import { TabPanel, Tabs } from '@/components/dialog';
import { can, useMe } from '@/lib/session';

export default function AdminPage() {
  const { data: me } = useMe();
  const tabs = [
    { value: 'usuarios', label: 'Usuarios', hidden: !can(me, 'admin:users') },
    { value: 'roles', label: 'Roles y permisos', hidden: !can(me, 'admin:users') },
    { value: 'configuracion', label: 'Configuración', hidden: !can(me, 'admin:settings') },
    { value: 'estructura', label: 'Estructura académica', hidden: !can(me, 'people:write', 'admin:settings') },
    { value: 'integraciones', label: 'Phidias', hidden: !can(me, 'admin:integrations') },
    { value: 'cumplimiento', label: 'Cumplimiento legal', hidden: !can(me, 'compliance:manage') },
    { value: 'auditoria', label: 'Auditoría', hidden: !can(me, 'audit:read') },
    { value: 'notificaciones', label: 'Notificaciones', hidden: !can(me, 'admin:settings') },
    { value: 'sistema', label: 'Sistema', hidden: !can(me, 'admin:settings', 'admin:integrations') },
    { value: 'colegios', label: 'Colegios', hidden: !can(me, 'tenants:manage') },
  ];
  const first = tabs.find((t) => !t.hidden)?.value ?? 'usuarios';
  const [tab, setTab] = useState<string | null>(null);
  const current = tab ?? first;
  return (
    <div>
      <PageHeader title="Administración" description={me?.tenant.name} />
      <Tabs value={current} onValueChange={setTab} tabs={tabs}>
        <TabPanel value="usuarios">{current === 'usuarios' && <UsersPanel />}</TabPanel>
        <TabPanel value="roles">{current === 'roles' && <RolesPanel />}</TabPanel>
        <TabPanel value="configuracion">{current === 'configuracion' && <SettingsPanel />}</TabPanel>
        <TabPanel value="estructura">{current === 'estructura' && <StructurePanel />}</TabPanel>
        <TabPanel value="integraciones">{current === 'integraciones' && <IntegrationsPanel />}</TabPanel>
        <TabPanel value="cumplimiento">{current === 'cumplimiento' && <CompliancePanel />}</TabPanel>
        <TabPanel value="auditoria">{current === 'auditoria' && <AuditPanel />}</TabPanel>
        <TabPanel value="notificaciones">{current === 'notificaciones' && <NotificationsPanel />}</TabPanel>
        <TabPanel value="sistema">{current === 'sistema' && <SystemPanel />}</TabPanel>
        <TabPanel value="colegios">{current === 'colegios' && <TenantsPanel />}</TabPanel>
      </Tabs>
    </div>
  );
}
