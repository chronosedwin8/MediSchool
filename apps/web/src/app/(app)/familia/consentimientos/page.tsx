'use client';

import { Badge, Button, Card, PageHeader, Skeleton } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { useState } from 'react';
import { ChildSelector } from '@/components/child-selector';
import { type ConsentTemplate, ConsentSign } from '@/components/consent-sign';
import { Dialog } from '@/components/dialog';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Row {
  template: ConsentTemplate;
  status: 'GRANTED' | 'PENDING' | 'REVOKED';
  consent: { id: string; signedAt: string; signatureHash: string } | null;
}

export default function ConsentsPage() {
  const qc = useQueryClient();
  const [childId, setChildId] = useState<string | null>(null);
  const [signing, setSigning] = useState<ConsentTemplate | null>(null);
  const q = useQuery({ queryKey: ['consents', childId], queryFn: () => api<Row[]>(`/students/${childId}/consents`), enabled: !!childId });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/consents/${id}/revoke`, { body: { reason: 'Revocado por el acudiente desde el portal' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents', childId] }),
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Consentimientos" description="Autorizaciones firmadas digitalmente conforme a la Ley 1581 de 2012." />
      <ChildSelector value={childId} onChange={setChildId} />
      {q.isLoading && <Skeleton className="h-48" />}
      <ul className="flex flex-col gap-3">
        {q.data?.map((r) => (
          <Card key={r.template.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary-700" />
              <p className="flex-1 font-medium">
                {r.template.title} <span className="text-xs text-muted">v{r.template.version}</span>
              </p>
              {r.status === 'GRANTED' ? <Badge tone="success">Firmado</Badge> : <Badge tone={r.template.mandatory ? 'danger' : 'warning'}>{r.status === 'REVOKED' ? 'Revocado' : r.template.mandatory ? 'Obligatorio pendiente' : 'Pendiente'}</Badge>}
            </div>
            {r.consent && (
              <p className="mt-1 text-xs text-muted">
                Firmado {fmtDateTime(r.consent.signedAt)} · huella {r.consent.signatureHash?.slice(0, 12)}…
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {r.status !== 'GRANTED' ? (
                <Button size="sm" onClick={() => setSigning(r.template)}>
                  Leer y firmar
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => window.confirm('¿Revocar este consentimiento? Algunas atenciones podrían requerir contactarlo primero.') && revoke.mutate(r.consent!.id)}>
                  Revocar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </ul>
      {signing && childId && (
        <Dialog open onOpenChange={(o) => !o && setSigning(null)} title="Firmar consentimiento" size="lg">
          <ConsentSign template={signing} studentId={childId} onSigned={() => { setSigning(null); qc.invalidateQueries({ queryKey: ['consents', childId] }); qc.invalidateQueries({ queryKey: ['portal-home'] }); }} />
        </Dialog>
      )}
    </div>
  );
}
