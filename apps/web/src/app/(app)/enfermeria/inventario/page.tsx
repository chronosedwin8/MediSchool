'use client';

import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, EmptyState, Field, Input, PageHeader, Select, Skeleton, StatCard } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, ClipboardCheck, PackagePlus, Thermometer, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Dialog, TabPanel, Tabs } from '@/components/dialog';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, todayIso } from '@/lib/format';
import { can, useMe } from '@/lib/session';

interface Batch {
  id: string;
  lot: string;
  expiryDate: string | null;
  quantity: number;
  expired: boolean;
  expiringSoon: boolean;
  location: { id: string; name: string };
}
interface Item {
  id: string;
  kind: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  lowStock: boolean;
  expiringSoon: boolean;
  expiredQuantity: number;
  nextExpiry: string | null;
  controlled: boolean;
  requiresRefrigeration: boolean;
  unitCost: number | null;
  batches: Batch[];
}
interface Location {
  id: string;
  name: string;
  kind: string;
  minTempC: number | null;
  maxTempC: number | null;
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [tab, setTab] = useState('stock');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [receive, setReceive] = useState<Item | null>(null);
  const [movement, setMovement] = useState<{ item: Item; batch: Batch } | null>(null);
  const [kitCheck, setKitCheck] = useState<null | { id: string; name: string; items: { itemId: string; expectedQuantity: number; item?: { name: string } }[] }>(null);
  const items = useQuery({ queryKey: ['inventory-items', kind, q], queryFn: () => api<Item[]>('/inventory/items', { query: { kind, q } }) });
  const summary = useQuery({ queryKey: ['inventory-summary'], queryFn: () => api<{ items: number; lowStock: unknown[]; expiringSoon: unknown[]; expired: unknown[]; stockValue: number; topConsumption: { name: string; quantity: number }[] }>('/inventory/summary') });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('/inventory/locations') });
  const kits = useQuery({ queryKey: ['kits'], queryFn: () => api<{ id: string; name: string; kind: string; locationDescription: string; lastCheckedAt: string | null; due: boolean; checkEveryDays: number; items: { itemId: string; expectedQuantity: number; item?: { name: string } }[]; checks: { id: string; ok: boolean; createdAt: string }[] }[]>('/inventory/kits'), enabled: tab === 'kits' });
  const fridge = locations.data?.find((l) => l.kind === 'FRIDGE');
  const logs = useQuery({ queryKey: ['fridge', fridge?.id], queryFn: () => api<{ recordedAt: string; temperatureC: number; outOfRange: boolean }[]>('/inventory/fridge-logs', { query: { locationId: fridge?.id, days: 14 } }), enabled: tab === 'frio' && !!fridge });
  const movements = useQuery({ queryKey: ['movements'], queryFn: () => api<{ id: string; createdAt: string; type: string; quantity: number; reason: string | null; item: { name: string; unit: string }; batch: { lot: string } | null }[]>('/inventory/movements', { query: { limit: 100 } }), enabled: tab === 'movimientos' });
  const [temp, setTemp] = useState('');
  const logTemp = useMutation({
    mutationFn: () => api<{ outOfRange: boolean }>('/inventory/fridge-logs', { body: { locationId: fridge!.id, temperatureC: Number(temp) } }),
    onSuccess: (r) => {
      setTemp('');
      if (r.outOfRange) toast.error('Temperatura fuera de rango: se notificó a coordinación');
      else toast.success('Temperatura registrada');
      qc.invalidateQueries({ queryKey: ['fridge'] });
    },
  });
  const writable = can(me, 'inventory:write');

  return (
    <div>
      <PageHeader title="Inventario y botiquines" description="Lotes con FEFO: se usa primero lo que vence primero; los vencidos quedan bloqueados." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ítems" value={summary.data?.items ?? '—'} icon={<Boxes />} />
        <StatCard label="Stock bajo" value={summary.data?.lowStock.length ?? '—'} icon={<TrendingDown />} tone={summary.data?.lowStock.length ? 'warning' : 'neutral'} />
        <StatCard label="Por vencer (30 días)" value={summary.data?.expiringSoon.length ?? '—'} icon={<AlertTriangle />} tone={summary.data?.expiringSoon.length ? 'danger' : 'neutral'} />
        <StatCard label="Valor del stock" value={fmtMoney(summary.data?.stockValue)} />
      </div>
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'stock', label: 'Existencias' }, { value: 'kits', label: 'Botiquines' }, { value: 'frio', label: 'Cadena de frío' }, { value: 'movimientos', label: 'Movimientos' }]}>
        <TabPanel value="stock">
          <Card className="mb-3 grid gap-3 p-3 md:grid-cols-[1fr_200px]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ítem" aria-label="Buscar ítem" />
            <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
              <option value="">Medicamentos e insumos</option>
              <option value="MEDICATION">Medicamentos</option>
              <option value="SUPPLY">Insumos</option>
            </Select>
          </Card>
          {items.isLoading && <Skeleton className="h-96" />}
          <div className="flex flex-col gap-2">
            {items.data?.map((i) => (
              <details key={i.id} className={cn('rounded-2xl border bg-card', i.lowStock ? 'border-amber-300 dark:border-amber-800' : 'border-border')}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 font-medium">{i.name}</span>
                  {i.controlled && <Badge tone="warning">Control</Badge>}
                  {i.requiresRefrigeration && <Badge tone="info">Nevera</Badge>}
                  {i.expiredQuantity > 0 && <Badge tone="danger">{i.expiredQuantity} vencidos bloqueados</Badge>}
                  {i.expiringSoon && <Badge tone="warning">Vence {fmtDate(i.nextExpiry)}</Badge>}
                  <span className={cn('tabular text-sm font-semibold', i.lowStock && 'text-amber-600')}>
                    {i.stock} {i.unit}
                  </span>
                  <span className="text-xs text-muted">mín. {i.minStock}</span>
                  {writable && (
                    <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); setReceive(i); }}>
                      <PackagePlus className="h-4 w-4" /> Ingreso
                    </Button>
                  )}
                </summary>
                <table className="w-full border-t border-border text-sm">
                  <tbody>
                    {i.batches.map((b) => (
                      <tr key={b.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">Lote {b.lot}</td>
                        <td>{b.location.name}</td>
                        <td className={cn(b.expired && 'font-semibold text-red-600', b.expiringSoon && 'text-amber-600')}>{b.expiryDate ? fmtDate(b.expiryDate) : 'Sin vencimiento'}</td>
                        <td className="tabular">{b.quantity}</td>
                        <td className="pr-3 text-right">
                          {writable && (
                            <Button size="sm" variant="ghost" onClick={() => setMovement({ item: i, batch: b })}>
                              Movimiento
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {i.batches.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-muted">Sin lotes con existencias.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        </TabPanel>

        <TabPanel value="kits">
          <div className="grid gap-3 md:grid-cols-2">
            {kits.data?.map((k) => (
              <Card key={k.id} className={cn(k.due && 'border-amber-300')}>
                <CardHeader>
                  <div>
                    <CardTitle>{k.name}</CardTitle>
                    <p className="text-sm text-muted">{k.locationDescription}</p>
                  </div>
                  {k.due ? <Badge tone="warning">Revisión pendiente</Badge> : <Badge tone="success">Al día</Badge>}
                </CardHeader>
                <CardContent>
                  <ul className="mb-3 text-sm">
                    {k.items.map((it) => (
                      <li key={it.itemId}>
                        {it.item?.name} × {it.expectedQuantity}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">
                    Última revisión: {k.lastCheckedAt ? fmtDate(k.lastCheckedAt) : 'nunca'} · cada {k.checkEveryDays} días
                  </p>
                  {writable && (
                    <Button size="sm" className="mt-3" variant="outline" onClick={() => setKitCheck(k)}>
                      <ClipboardCheck className="h-4 w-4" /> Revisar ahora
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabPanel>

        <TabPanel value="frio">
          {!fridge ? (
            <EmptyState icon={<Thermometer />} title="No hay neveras configuradas" />
          ) : (
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <p className="font-semibold">{fridge.name}</p>
                  <p className="text-sm text-muted">
                    Rango permitido {fridge.minTempC} – {fridge.maxTempC} °C
                  </p>
                </div>
                {writable && (
                  <>
                    <Field label="Temperatura actual (°C)">
                      <Input type="number" inputMode="decimal" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} className="w-32" />
                    </Field>
                    <Button onClick={() => logTemp.mutate()} disabled={temp === ''} loading={logTemp.isPending}>
                      Registrar
                    </Button>
                  </>
                )}
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={logs.data?.map((l) => ({ t: fmtDateTime(l.recordedAt), temp: l.temperatureC }))} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="t" fontSize={10} stroke="var(--muted)" hide />
                    <YAxis domain={[0, 12]} fontSize={11} stroke="var(--muted)" />
                    <ReferenceArea y1={fridge.minTempC ?? 2} y2={fridge.maxTempC ?? 8} fill="#10b981" fillOpacity={0.08} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="temp" name="°C" stroke="#0d8177" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {logs.data?.some((l) => l.outOfRange) && <Alert tone="danger" className="mt-3">Hubo {logs.data.filter((l) => l.outOfRange).length} lectura(s) fuera de rango en los últimos 14 días. Revise la integridad de los medicamentos refrigerados.</Alert>}
            </Card>
          )}
        </TabPanel>

        <TabPanel value="movimientos">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-card-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th>Ítem</th>
                  <th>Lote</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.data?.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="tabular px-3 py-2">{fmtDateTime(m.createdAt)}</td>
                    <td>{m.item.name}</td>
                    <td>{m.batch?.lot}</td>
                    <td>
                      <Badge tone={m.quantity > 0 ? 'success' : m.type === 'EXPIRED' ? 'danger' : 'neutral'}>{m.type}</Badge>
                    </td>
                    <td className={cn('tabular', m.quantity < 0 ? 'text-red-600' : 'text-emerald-700')}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="text-muted">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabPanel>
      </Tabs>

      {receive && <ReceiveDialog item={receive} locations={locations.data ?? []} onClose={() => setReceive(null)} />}
      {movement && <MovementDialog item={movement.item} batch={movement.batch} onClose={() => setMovement(null)} />}
      {kitCheck && <KitCheckDialog kit={kitCheck} onClose={() => setKitCheck(null)} />}
    </div>
  );
}

function ReceiveDialog({ item, locations, onClose }: { item: Item; locations: Location[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ lot: '', expiryDate: '', quantity: '', locationId: locations.find((l) => (item.requiresRefrigeration ? l.kind === 'FRIDGE' : item.controlled ? l.kind === 'CONTROLLED_CABINET' : l.kind === 'SHELF'))?.id ?? locations[0]?.id ?? '', source: 'PURCHASE', unitCost: '' });
  const mut = useMutation({
    mutationFn: () => api('/inventory/batches', { body: { itemId: item.id, lot: v.lot, expiryDate: v.expiryDate || null, quantity: Number(v.quantity), locationId: v.locationId, source: v.source, unitCost: v.unitCost ? Number(v.unitCost) : null } }),
    onSuccess: () => {
      toast.success('Ingreso registrado');
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Ingreso · ${item.name}`} footer={<Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!v.lot || Number(v.quantity) <= 0 || !v.locationId}>Registrar ingreso</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lote" required>
          <Input value={v.lot} onChange={(e) => setV({ ...v, lot: e.target.value })} />
        </Field>
        <Field label="Vencimiento" required={item.kind === 'MEDICATION'}>
          <Input type="date" min={todayIso()} value={v.expiryDate} onChange={(e) => setV({ ...v, expiryDate: e.target.value })} />
        </Field>
        <Field label={`Cantidad (${item.unit})`} required>
          <Input type="number" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
        </Field>
        <Field label="Ubicación">
          <Select value={v.locationId} onChange={(e) => setV({ ...v, locationId: e.target.value })}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Origen">
          <Select value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })}>
            <option value="PURCHASE">Compra</option>
            <option value="DONATION">Donación</option>
            <option value="TRANSFER">Traslado</option>
          </Select>
        </Field>
        <Field label="Costo unitario">
          <Input type="number" value={v.unitCost} onChange={(e) => setV({ ...v, unitCost: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

function MovementDialog({ item, batch, onClose }: { item: Item; batch: Batch; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ type: 'CONSUMPTION', quantity: '1', reason: '', secondSignerEmail: '', secondSignerPassword: '' });
  const needsDouble = v.type.startsWith('ADJUSTMENT') || item.controlled || v.type === 'DAMAGED';
  const mut = useMutation({
    mutationFn: () => api('/inventory/movements', { body: { itemId: item.id, batchId: batch.id, locationId: batch.location.id, type: v.type, quantity: Number(v.quantity), reason: v.reason, secondSignerEmail: needsDouble ? v.secondSignerEmail : null, secondSignerPassword: needsDouble ? v.secondSignerPassword : null } }),
    onSuccess: () => {
      toast.success('Movimiento registrado');
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Movimiento · ${item.name}`} description={`Lote ${batch.lot} · existencias ${batch.quantity}`} footer={<Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={v.reason.trim().length < 3 || Number(v.quantity) <= 0}>Registrar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
            <option value="CONSUMPTION">Consumo</option>
            <option value="EXPIRED">Vencido (disposición)</option>
            <option value="DAMAGED">Averiado</option>
            <option value="RETURN">Devolución</option>
            <option value="ADJUSTMENT_IN">Ajuste positivo</option>
            <option value="ADJUSTMENT_OUT">Ajuste negativo</option>
          </Select>
        </Field>
        <Field label="Cantidad">
          <Input type="number" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
        </Field>
        <Field label="Motivo" required className="sm:col-span-2">
          <Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
        </Field>
        {needsDouble && (
          <>
            <Alert tone="warning" className="sm:col-span-2">Requiere doble firma: otro profesional de salud debe autorizar con su correo y contraseña.</Alert>
            <Field label="Correo del segundo responsable">
              <Input type="email" value={v.secondSignerEmail} onChange={(e) => setV({ ...v, secondSignerEmail: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Contraseña">
              <Input type="password" value={v.secondSignerPassword} onChange={(e) => setV({ ...v, secondSignerPassword: e.target.value })} autoComplete="off" />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

function KitCheckDialog({ kit, onClose }: { kit: { id: string; name: string; items: { itemId: string; expectedQuantity: number; item?: { name: string } }[] }; onClose: () => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState(kit.items.map((i) => ({ itemId: i.itemId, name: i.item?.name ?? '', expected: i.expectedQuantity, present: i.expectedQuantity, expiryOk: true })));
  const [notes, setNotes] = useState('');
  const mut = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/inventory/kits/${kit.id}/checks`, { body: { lines: lines.map((l) => ({ itemId: l.itemId, present: l.present, expiryOk: l.expiryOk })), notes: notes || null } }),
    onSuccess: (r) => {
      if (r.ok) toast.success('Botiquín completo');
      else toast.warning('Revisión registrada con faltantes');
      qc.invalidateQueries({ queryKey: ['kits'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Revisión · ${kit.name}`} footer={<Button onClick={() => mut.mutate()} loading={mut.isPending}>Guardar revisión</Button>}>
      <ul className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <li key={l.itemId} className="grid grid-cols-[1fr_90px_auto] items-center gap-2 text-sm">
            <span>
              {l.name} <span className="text-muted">(esperado {l.expected})</span>
            </span>
            <Input type="number" value={l.present} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, present: Number(e.target.value) } : x)))} aria-label={`Cantidad presente de ${l.name}`} />
            <label className="flex items-center gap-1">
              <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={l.expiryOk} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, expiryOk: e.target.checked } : x)))} /> Vigente
            </label>
          </li>
        ))}
      </ul>
      <Field label="Observaciones" className="mt-3">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Dialog>
  );
}
