'use client';

import { Alert, Button, Card, Field, Input } from '@sgee/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const [v, setV] = useState({ invitationCode: params.get('codigo') ?? '', firstName: '', lastName: '', documentNumber: '', phone: '', email: '', password: '', confirm: '', accept: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const strong = v.password.length >= 10 && /[A-Z]/.test(v.password) && /[a-z]/.test(v.password) && /\d/.test(v.password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ user: { home: string } }>('/auth/register-parent', {
        body: { invitationCode: v.invitationCode.trim().toUpperCase(), firstName: v.firstName, lastName: v.lastName, documentNumber: v.documentNumber, phone: v.phone, email: v.email, password: v.password },
      });
      router.replace(r.user.home);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <p className="text-lg font-semibold">Crear cuenta de acudiente</p>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
          <Field label="Código de invitación" required className="sm:col-span-2">
            <Input value={v.invitationCode} onChange={(e) => setV({ ...v, invitationCode: e.target.value.toUpperCase() })} className="tabular tracking-widest" />
          </Field>
          <Field label="Nombres" required>
            <Input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} autoComplete="given-name" />
          </Field>
          <Field label="Apellidos" required>
            <Input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} autoComplete="family-name" />
          </Field>
          <Field label="Documento" required>
            <Input value={v.documentNumber} onChange={(e) => setV({ ...v, documentNumber: e.target.value })} inputMode="numeric" />
          </Field>
          <Field label="Celular" required>
            <Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} autoComplete="tel" />
          </Field>
          <Field label="Correo" required className="sm:col-span-2">
            <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" />
          </Field>
          <Field label="Contraseña" required hint="Mínimo 10 caracteres con mayúscula, minúscula y número.">
            <Input type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar contraseña" required>
            <Input type="password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} autoComplete="new-password" />
          </Field>
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary-700" checked={v.accept} onChange={(e) => setV({ ...v, accept: e.target.checked })} />
            Acepto la política de tratamiento de datos personales (Ley 1581 de 2012). Firmaré los consentimientos específicos dentro del portal.
          </label>
          <Button type="submit" size="lg" className="sm:col-span-2" loading={loading} disabled={!v.accept || !strong || v.password !== v.confirm}>
            Crear cuenta
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
