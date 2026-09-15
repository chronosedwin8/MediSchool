'use client';

import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@sgee/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/dialog';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface Circular {
  id: string;
  title: string;
  body: string;
  category: string;
  publishedAt: string;
  readAt?: string | null;
}

const CATEGORY: Record<string, string> = { OUTBREAK: 'Brote', CAMPAIGN: 'Campaña', RECOMMENDATION: 'Recomendación', GENERAL: 'General' };

export default function CircularsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['circulars'], queryFn: () => api<Circular[]>('/circulars') });
  const [open, setOpen] = useState<Circular | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Circulares de salud" />
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data?.length === 0 && <EmptyState icon={<Megaphone />} title="Sin circulares" />}
      <ul className="flex flex-col gap-3">
        {q.data?.map((c) => (
          <li key={c.id}>
            <button
              className="w-full text-left"
              onClick={() => {
                setOpen(c);
                api(`/circulars/${c.id}`).then(() => qc.invalidateQueries({ queryKey: ['circulars'] }));
              }}
            >
              <Card className="p-4 hover:border-primary-400">
                <div className="flex items-center gap-2">
                  {!c.readAt && <span className="h-2 w-2 rounded-full bg-primary-600" aria-label="Sin leer" />}
                  <p className="flex-1 font-medium">{c.title}</p>
                  <Badge tone={c.category === 'OUTBREAK' ? 'warning' : 'neutral'}>{CATEGORY[c.category] ?? c.category}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{c.body}</p>
                <p className="mt-1 text-xs text-muted">{fmtDate(c.publishedAt)}</p>
              </Card>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Dialog open onOpenChange={() => setOpen(null)} title={open.title} description={fmtDate(open.publishedAt)}>
          <p className="whitespace-pre-wrap leading-relaxed">{open.body}</p>
        </Dialog>
      )}
    </div>
  );
}
