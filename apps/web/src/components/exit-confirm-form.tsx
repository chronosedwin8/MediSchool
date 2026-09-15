'use client';

import { Button, cn, Field, Input } from '@sgee/ui';
import { useState } from 'react';
import { RELATIONSHIP_LABELS } from '@/lib/format';

export interface PickupOption {
  kind: 'GUARDIAN' | 'CONTACT';
  personId: string | null;
  name: string;
  relationship: string;
  document: string | null;
}

export interface ExitConfirmBody {
  pickupGuardianPersonId: string | null;
  pickupName: string;
  pickupDocument: string;
  pickupRelationship: string;
  pickupPhone: string | null;
  estimatedArrival: string | null;
}

export function ExitConfirmForm({ options, onSubmit, loading }: { options: PickupOption[]; onSubmit: (b: ExitConfirmBody) => void; loading?: boolean }) {
  const [choice, setChoice] = useState<number | 'other' | null>(options.length ? 0 : 'other');
  const [other, setOther] = useState({ name: '', document: '', relationship: '', phone: '' });
  const [doc, setDoc] = useState(options[0]?.document ?? '');
  const [eta, setEta] = useState('');
  const selected = typeof choice === 'number' ? options[choice] : null;

  const body = (): ExitConfirmBody | null => {
    if (selected) {
      const d = doc || selected.document || '';
      if (d.length < 3) return null;
      return { pickupGuardianPersonId: selected.kind === 'GUARDIAN' ? selected.personId : null, pickupName: selected.name, pickupDocument: d, pickupRelationship: RELATIONSHIP_LABELS[selected.relationship] ?? selected.relationship, pickupPhone: null, estimatedArrival: eta || null };
    }
    if (other.name.length < 3 || other.document.length < 3 || other.relationship.length < 2) return null;
    return { pickupGuardianPersonId: null, pickupName: other.name, pickupDocument: other.document, pickupRelationship: other.relationship, pickupPhone: other.phone || null, estimatedArrival: eta || null };
  };
  const b = body();

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Quién recogerá al estudiante?</legend>
        {options.map((o, i) => (
          <button
            key={`${o.name}-${i}`}
            type="button"
            onClick={() => {
              setChoice(i);
              setDoc(o.document ?? '');
            }}
            className={cn('min-h-12 rounded-xl border px-4 text-left', choice === i ? 'border-primary-700 bg-primary-50 dark:bg-primary-950' : 'border-border')}
          >
            <span className="font-medium">{o.name}</span> <span className="text-sm text-muted">· {RELATIONSHIP_LABELS[o.relationship] ?? o.relationship}</span>
          </button>
        ))}
        <button type="button" onClick={() => setChoice('other')} className={cn('min-h-12 rounded-xl border px-4 text-left', choice === 'other' ? 'border-primary-700 bg-primary-50 dark:bg-primary-950' : 'border-border')}>
          Otra persona
        </button>
      </fieldset>
      {selected && !selected.document && (
        <Field label="Documento de identidad de quien recoge" required hint="Portería verificará este documento.">
          <Input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}
      {choice === 'other' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo" required>
            <Input value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} />
          </Field>
          <Field label="Documento" required>
            <Input inputMode="numeric" value={other.document} onChange={(e) => setOther({ ...other, document: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Relación con el estudiante" required>
            <Input value={other.relationship} onChange={(e) => setOther({ ...other, relationship: e.target.value })} />
          </Field>
          <Field label="Celular">
            <Input type="tel" value={other.phone} onChange={(e) => setOther({ ...other, phone: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Hora estimada de llegada">
        <Input type="time" value={eta} onChange={(e) => setEta(e.target.value)} className="w-40" />
      </Field>
      <Button size="lg" disabled={!b} loading={loading} onClick={() => b && onSubmit(b)}>
        Confirmar
      </Button>
    </div>
  );
}
