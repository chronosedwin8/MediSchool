'use client';

import { Alert, Button, Card, Field, Input } from '@sgee/ui';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, MonitorSmartphone, ShieldCheck, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface LoginResult {
  accessToken?: string;
  user?: { home: string; mustChangePassword: boolean };
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  challengeToken?: string;
}

const DEMO = [
  { label: 'Enfermería', email: 'enfermera1@colegio-aleman.test' },
  { label: 'Docente', email: 'docente@colegio-aleman.test' },
  { label: 'Padre / acudiente', email: 'padre@colegio-aleman.test' },
  { label: 'Administrador', email: 'admin@colegio-aleman.test' },
  { label: 'Directivo (demo)', email: 'directivo@colegio-demo.test' },
  { label: 'Portería', email: 'porteria@colegio-aleman.test' },
  { label: 'Médico', email: 'medico@colegio-aleman.test' },
  { label: 'Coordinación', email: 'coordinacion@colegio-aleman.test' },
];

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'password' | 'kiosk'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<{ slug: string; name: string }[] | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | undefined>();
  const [mfa, setMfa] = useState<{ token: string; setup: boolean; qr?: string; secret?: string } | null>(null);
  const [code, setCode] = useState('');
  const [kiosk, setKiosk] = useState({ tenantSlug: 'colegio-aleman', deviceCode: 'PORTERIA-1', pin: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const done = (r: LoginResult) => {
    qc.clear();
    if (r.user?.mustChangePassword) return router.replace('/cambiar-clave');
    const next = params.get('next');
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : (r.user?.home ?? '/'));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mfa) {
        const r = await api<LoginResult>('/auth/mfa/verify', { body: { challengeToken: mfa.token, code } });
        return done(r);
      }
      if (mode === 'kiosk') return done(await api<LoginResult>('/auth/kiosk', { body: kiosk }));
      const r = await api<LoginResult>('/auth/login', { body: { email, password, tenantSlug } });
      if (r.mfaRequired && r.challengeToken) {
        if (r.mfaSetupRequired) {
          const setup = await api<{ qr: string; secret: string }>('/auth/mfa/setup-challenge', { body: { challengeToken: r.challengeToken } });
          setMfa({ token: r.challengeToken, setup: true, qr: setup.qr, secret: setup.secret });
        } else setMfa({ token: r.challengeToken, setup: false });
        return;
      }
      done(r);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TENANT_REQUIRED') setTenants((err.body?.tenants as { slug: string; name: string }[]) ?? []);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <span className="text-lg font-semibold">MediSchool</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Enfermería escolar, trazable y segura.</h1>
          <p className="mt-4 text-white/80">Atenciones, pases del aula a portería, medicación con los 5 correctos y comunicación con las familias en un solo lugar.</p>
          <ul className="mt-8 space-y-3 text-sm text-white/85">
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /> Historia clínica inmutable con cadena de hash</li>
            <li className="flex items-center gap-3"><Stethoscope className="h-5 w-5" /> Alertas de alergias siempre visibles</li>
            <li className="flex items-center gap-3"><MonitorSmartphone className="h-5 w-5" /> Funciona en computador, tablet y celular</li>
          </ul>
        </div>
        <p className="text-xs text-white/60">Datos protegidos según Ley 1581 de 2012 y Resolución 1995 de 1999.</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-600/40 blur-3xl" />
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <Card className="w-full max-w-md p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="text-lg font-semibold">MediSchool</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{mfa ? 'Verificación en dos pasos' : t('auth.login')}</h2>
          <p className="mt-1 text-sm text-muted">{mfa ? (mfa.setup ? 'Escanee el código con su app autenticadora y escriba el código de 6 dígitos.' : 'Escriba el código de su aplicación autenticadora.') : 'Ingrese con su cuenta institucional.'}</p>

          {!mfa && (
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-card-muted p-1" role="tablist">
              {(['password', 'kiosk'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-10 rounded-lg text-sm font-medium ${mode === m ? 'bg-card shadow-sm' : 'text-muted'}`}>
                  {m === 'password' ? 'Usuario' : t('auth.kiosk')}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            {error && <Alert tone="danger">{error}</Alert>}
            {mfa ? (
              <>
                {mfa.qr && <img src={mfa.qr} alt="Código QR para la app autenticadora" className="mx-auto h-44 w-44 rounded-xl border border-border bg-white p-2" />}
                {mfa.secret && <p className="text-center font-mono text-xs text-muted">{mfa.secret}</p>}
                <Field label="Código" htmlFor="code">
                  <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="tabular text-center text-2xl tracking-[0.5em]" autoFocus />
                </Field>
              </>
            ) : mode === 'password' ? (
              <>
                <Field label={t('auth.email')} htmlFor="email">
                  <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </Field>
                <Field label={t('auth.password')} htmlFor="password">
                  <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                {tenants && (
                  <Field label="Colegio">
                    <div className="flex flex-col gap-2">
                      {tenants.map((tn) => (
                        <Button key={tn.slug} variant={tenantSlug === tn.slug ? 'primary' : 'outline'} onClick={() => setTenantSlug(tn.slug)}>
                          {tn.name}
                        </Button>
                      ))}
                    </div>
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Colegio (identificador)" htmlFor="slug">
                  <Input id="slug" value={kiosk.tenantSlug} onChange={(e) => setKiosk({ ...kiosk, tenantSlug: e.target.value })} />
                </Field>
                <Field label="Código del dispositivo" htmlFor="device">
                  <Input id="device" value={kiosk.deviceCode} onChange={(e) => setKiosk({ ...kiosk, deviceCode: e.target.value })} />
                </Field>
                <Field label="PIN" htmlFor="pin">
                  <Input id="pin" type="password" inputMode="numeric" maxLength={8} value={kiosk.pin} onChange={(e) => setKiosk({ ...kiosk, pin: e.target.value.replace(/\D/g, '') })} className="tabular text-center text-2xl tracking-[0.4em]" />
                </Field>
              </>
            )}
            <Button type="submit" size="lg" loading={loading}>
              <KeyRound className="h-4 w-4" /> {mfa ? 'Verificar' : t('auth.login')}
            </Button>
          </form>

          {!mfa && mode === 'password' && (
            <>
              <p className="mt-5 text-center text-sm text-muted">
                ¿Es acudiente y tiene un código de invitación? <Link href="/registro" className="font-medium text-primary-700 hover:underline dark:text-primary-300">Crear cuenta</Link>
              </p>
              {process.env.NODE_ENV !== 'production' && (
                <details className="mt-5 rounded-xl border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Cuentas de demostración</summary>
                  <p className="mt-2 text-xs text-muted">Contraseña: MediSchool2026! · Kiosco: PORTERIA-1 / PIN 2468</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {DEMO.map((d) => (
                      <button key={d.email} type="button" className="rounded-lg border border-border px-2 py-1.5 text-left text-xs hover:bg-card-muted" onClick={() => { setEmail(d.email); setPassword('MediSchool2026!'); }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </Card>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
