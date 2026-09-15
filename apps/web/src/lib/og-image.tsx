import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = 'MediSchool: software de enfermería escolar para colegios';

/** Social sharing card (Open Graph / Twitter) rendered at build time. */
export function renderOgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #0f6761 0%, #114441 100%)', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f6761', fontSize: 48, fontWeight: 700 }}>+</div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>MediSchool</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>Software de enfermería escolar para colegios</div>
          <div style={{ marginTop: 24, fontSize: 30, opacity: 0.85, maxWidth: 980 }}>Historia clínica · Pases del aula a portería · Medicación segura · Portal de familias</div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.75 }}>Integrado con Phidias · Cumple la Ley 1581 de 2012</div>
      </div>
    ),
    OG_SIZE,
  );
}
