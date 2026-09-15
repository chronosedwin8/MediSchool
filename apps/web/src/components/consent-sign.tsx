'use client';

import { Alert, Button, Field, Input } from '@sgee/ui';
import { useMutation } from '@tanstack/react-query';
import { FileSignature, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export interface ConsentTemplate {
  id: string;
  type?: string;
  title: string;
  body: string;
  version: string;
  mandatory: boolean;
}

/** Signature with one-time code (OTP) + IP + timestamp + hash (PLAN §4.3). */
export function ConsentSign({ template, studentId, onSigned }: { template: ConsentTemplate; studentId: string; onSigned: () => void }) {
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [accepted, setAccepted] = useState(false);
  const request = useMutation({
    mutationFn: () => api<{ sent: boolean; devOtp?: string }>('/consents/otp', { body: { templateId: template.id, studentId } }),
    onSuccess: (r) => {
      setSent(true);
      toast.success('Enviamos un código a su correo y a sus notificaciones.', { description: r.devOtp ? `Código (solo desarrollo): ${r.devOtp}` : undefined, duration: 15000 });
    },
  });
  const sign = useMutation({
    mutationFn: () => api('/consents', { body: { templateId: template.id, studentId, otp, accepted: true } }),
    onSuccess: () => {
      toast.success('Consentimiento firmado');
      onSigned();
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card-muted p-4 text-sm leading-relaxed" tabIndex={0}>
        <p className="mb-2 font-semibold">
          {template.title} · versión {template.version}
        </p>
        <p className="whitespace-pre-wrap">{template.body}</p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary-700" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        He leído y acepto el consentimiento en calidad de representante legal del estudiante.
      </label>
      {!sent ? (
        <Button onClick={() => request.mutate()} disabled={!accepted} loading={request.isPending}>
          <Send className="h-4 w-4" /> Enviarme el código de firma
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Código de 6 dígitos">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="tabular text-center text-2xl tracking-[0.5em]" autoFocus />
          </Field>
          <Button onClick={() => sign.mutate()} disabled={otp.length !== 6 || !accepted} loading={sign.isPending}>
            <FileSignature className="h-4 w-4" /> Firmar
          </Button>
          <button className="text-sm text-muted hover:underline" onClick={() => request.mutate()}>
            Reenviar código
          </button>
        </div>
      )}
      <Alert tone="info">La firma registra fecha, hora, dirección IP, dispositivo y una huella SHA-256 del documento.</Alert>
    </div>
  );
}
