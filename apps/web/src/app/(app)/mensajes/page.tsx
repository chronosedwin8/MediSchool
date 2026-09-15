'use client';

import { Badge, Button, Card, cn, EmptyState, Input, PageHeader, Skeleton, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Send } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { StudentPicker, type StudentRow } from '@/components/student-picker';
import { api } from '@/lib/api';
import { fmtDateTime, relative } from '@/lib/format';
import { useLive } from '@/lib/live';
import { can, useMe } from '@/lib/session';

interface Thread {
  id: string;
  subject: string;
  studentName: string | null;
  updatedAt: string;
  lastMessage: { body: string; at: string; mine: boolean } | null;
  unread: boolean;
}
interface ThreadDetail {
  id: string;
  subject: string;
  messages: { id: string; body: string; createdAt: string; author: string; mine: boolean; authorRoles: string[] }[];
}

function Inner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const { data: me } = useMe();
  const [active, setActive] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [newOpen, setNewOpen] = useState(!!params.get('student'));
  const threads = useQuery({ queryKey: ['threads'], queryFn: () => api<Thread[]>('/threads') });
  const thread = useQuery({ queryKey: ['thread', active], queryFn: () => api<ThreadDetail>(`/threads/${active}`), enabled: !!active });
  useLive(['message'], [['threads'], ['thread', active]]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [thread.data?.messages.length]);
  useEffect(() => {
    if (!active && threads.data?.length) setActive(threads.data[0].id);
  }, [threads.data, active]);

  const send = useMutation({
    mutationFn: () => api('/messages', { body: { threadId: active, body } }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['thread', active] });
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Mensajes"
        description={can(me, 'comms:send') ? 'Conversaciones con las familias.' : 'Converse con enfermería sobre la salud de su hijo(a).'}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva conversación
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <Card className="max-h-[70dvh] overflow-y-auto p-2">
          {threads.isLoading && <Skeleton className="h-48" />}
          {threads.data?.length === 0 && <EmptyState icon={<MessageSquare />} title="Sin conversaciones" />}
          {threads.data?.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)} className={cn('flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left', active === t.id ? 'bg-primary-50 dark:bg-primary-950' : 'hover:bg-card-muted')}>
              <span className="flex items-center gap-2">
                <span className="flex-1 truncate font-medium">{t.subject}</span>
                {t.unread && <Badge tone="primary">Nuevo</Badge>}
              </span>
              <span className="truncate text-xs text-muted">{t.lastMessage ? `${t.lastMessage.mine ? 'Usted: ' : ''}${t.lastMessage.body}` : 'Sin mensajes'}</span>
              <span className="text-[11px] text-muted">{relative(t.updatedAt)}</span>
            </button>
          ))}
        </Card>
        <Card className="flex max-h-[70dvh] min-h-96 flex-col">
          {!active ? (
            <EmptyState className="m-6" title="Seleccione una conversación" />
          ) : (
            <>
              <div className="border-b border-border px-5 py-3 font-semibold">{thread.data?.subject}</div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {thread.data?.messages.map((m) => (
                  <div key={m.id} className={cn('flex flex-col', m.mine ? 'items-end' : 'items-start')}>
                    <div className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed', m.mine ? 'rounded-br-sm bg-primary-700 text-white' : 'rounded-bl-sm bg-card-muted')}>{m.body}</div>
                    <span className="mt-1 text-[11px] text-muted">
                      {m.mine ? 'Usted' : m.author} · {fmtDateTime(m.createdAt)}
                    </span>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form
                className="flex gap-2 border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (body.trim()) send.mutate();
                }}
              >
                <Textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escriba un mensaje" className="min-h-11 resize-none" aria-label="Mensaje" />
                <Button type="submit" size="icon" loading={send.isPending} aria-label="Enviar">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
      {newOpen && <NewThread initialStudentId={params.get('student')} onClose={() => setNewOpen(false)} onCreated={(id) => { setActive(id); setNewOpen(false); qc.invalidateQueries({ queryKey: ['threads'] }); }} />}
    </div>
  );
}

function NewThread({ initialStudentId, onClose, onCreated }: { initialStudentId: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { data: me } = useMe();
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const staff = can(me, 'comms:send');
  useEffect(() => {
    if (!student && me?.children.length) {
      const c = me.children.find((x) => x.id === initialStudentId) ?? me.children[0];
      setStudent({ id: c.id, name: c.name });
    }
  }, [me, initialStudentId, student]);
  const create = useMutation({ mutationFn: () => api<{ threadId: string }>('/messages', { body: { studentId: student?.id, subject: subject || null, body } }), onSuccess: (r) => onCreated(r.threadId) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nueva conversación" footer={<Button onClick={() => create.mutate()} disabled={!body.trim() || !student} loading={create.isPending}>Enviar</Button>}>
      <div className="flex flex-col gap-3">
        {staff ? (
          student ? (
            <div className="flex items-center justify-between rounded-xl bg-card-muted px-3 py-2">
              <span>{student.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setStudent(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <StudentPicker onSelect={(s: StudentRow) => setStudent({ id: s.id, name: s.name })} />
          )
        ) : (
          <select className="h-11 rounded-xl border border-border bg-card px-3" value={student?.id ?? ''} onChange={(e) => { const c = me?.children.find((x) => x.id === e.target.value); if (c) setStudent({ id: c.id, name: c.name }); }} aria-label="Estudiante">
            {me?.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <Input placeholder="Asunto (opcional)" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea rows={4} placeholder="Mensaje" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Dialog>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
