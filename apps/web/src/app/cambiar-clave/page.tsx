'use client';

import { Alert, Button, Card, Field, Input } from '@sgee/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rules = [
    { ok: form.newPassword.length >= 10, label: 'Mínimo 10 caracteres' },
    { ok: /[A-Z]/.test(form.newPassword), label: 'Una mayúscula' },
    { ok: /[a-z]/.test(form.newPassword), label: 'Una minúscula' },
    { ok: /\d/.test(form.newPassword), label: 'Un número' },
    { ok: !!form.newPassword && form.newPassword === form.confirm, label: 'Las contraseñas coinciden' },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ user: { home: string } }>('/auth/password', { body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace(r.user.home);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Cambie su contraseña</h1>
        <p className="mt-1 text-sm text-muted">Por seguridad debe definir una contraseña personal antes de continuar.</p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Contraseña actual" htmlFor="cur">
            <Input id="cur" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          </Field>
          <Field label="Nueva contraseña" htmlFor="new">
            <Input id="new" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
          </Field>
          <Field label="Confirmar" htmlFor="conf">
            <Input id="conf" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </Field>
          <ul className="grid grid-cols-2 gap-1 text-xs">
            {rules.map((r) => (
              <li key={r.label} className={r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'}>
                {r.ok ? '✓' : '○'} {r.label}
              </li>
            ))}
          </ul>
          <Button type="submit" size="lg" loading={loading} disabled={!rules.every((r) => r.ok)}>
            Guardar contraseña
          </Button>
        </form>
      </Card>
    </main>
  );
}
