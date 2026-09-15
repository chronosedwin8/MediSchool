import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CloudOff,
  DoorOpen,
  FileSignature,
  GraduationCap,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Pill,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Siren,
  Smartphone,
  Stethoscope,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/marketing/site-chrome';
import { absoluteUrl, jsonLd, SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  keywords: [...SITE.keywords],
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', title: SITE.title, description: SITE.description, siteName: SITE.name, locale: SITE.locale },
  twitter: { card: 'summary_large_image', title: SITE.title, description: SITE.description },
};

const FEATURES: { id: string; icon: ReactNode; title: string; text: string; points: string[]; guide: string }[] = [
  {
    id: 'pases',
    icon: <LayoutDashboard />,
    title: 'Tablero en vivo y pases digitales',
    text: 'El docente envía al estudiante a enfermería en dos toques desde el celular. Enfermería lo ve llegar en tiempo real y el docente sabe cuándo regresa al aula.',
    points: ['Alerta si el estudiante no llega a tiempo', 'Recepción con código QR o código corto', 'Funciona sin conexión y sincroniza al volver'],
    guide: '/ayuda/tablero-en-vivo-y-pases',
  },
  {
    id: 'historia',
    icon: <Stethoscope />,
    title: 'Historia clínica escolar',
    text: 'Atención completa en una sola pantalla: motivo, signos vitales valorados según la edad, notas SOAP, diagnóstico CIE-10, conducta y tratamiento.',
    points: ['Plantillas por motivo con signos de alarma', 'Firma al cerrar y registro inmutable', 'Adendas y anulación con motivo, nunca borrado'],
    guide: '/ayuda/atenciones-historia-clinica',
  },
  {
    id: 'medicacion',
    icon: <Pill />,
    title: 'Medicación segura',
    text: 'Las familias solicitan la administración con la foto de la fórmula; enfermería revisa, recibe en custodia y administra verificando los 5 correctos.',
    points: ['Bloqueo por alergias y fuera de horario', 'Doble verificación en medicamentos de control', 'Aviso a la familia en cada dosis'],
    guide: '/ayuda/medicacion-escolar',
  },
  {
    id: 'salidas',
    icon: <DoorOpen />,
    title: 'Salida con acudiente y portería',
    text: 'Cuando un estudiante debe irse a casa, el acudiente confirma quién lo recoge y portería verifica el documento antes de entregarlo.',
    points: ['Enlace seguro de un solo uso', 'Foto del estudiante y de quién recoge', 'Bloqueo si el documento no coincide'],
    guide: '/ayuda/salida-con-acudiente-y-porteria',
  },
  {
    id: 'familias',
    icon: <HeartPulse />,
    title: 'Portal para padres y acudientes',
    text: 'Desde el celular, la familia actualiza la ficha de salud, firma consentimientos, solicita medicamentos y recibe avisos de cada visita a enfermería.',
    points: ['Ficha con alergias, vacunas y contactos', 'Consentimientos firmados con código', 'Mensajes directos con enfermería'],
    guide: '/ayuda/rol-padres-y-acudientes',
  },
  {
    id: 'emergencias',
    icon: <Siren />,
    title: 'Modo emergencia',
    text: 'Un botón abre en segundos la ficha crítica del estudiante: alergias, plan de acción, medicación de rescate, contactos con llamada directa y protocolo paso a paso.',
    points: ['Protocolos de anafilaxia, convulsión, asma y RCP', 'Registro de simulacros y recursos (DEA)', 'Inicio inmediato de la atención'],
    guide: '/ayuda/emergencias-y-protocolos',
  },
  {
    id: 'inventario',
    icon: <Boxes />,
    title: 'Inventario y botiquines',
    text: 'Existencias por lote con salida FEFO: se usa primero lo que vence primero y lo vencido queda bloqueado. Los insumos se descuentan al cerrar la atención.',
    points: ['Alertas de stock bajo y vencimientos', 'Revisión periódica de botiquines', 'Registro de temperatura de la nevera'],
    guide: '/ayuda/inventario-y-botiquines',
  },
  {
    id: 'salud-publica',
    icon: <Activity />,
    title: 'Salud pública escolar',
    text: 'Detección automática de brotes por grupo y grado, estudiantes con consultas frecuentes, campañas, tamizajes, excusas médicas y salidas pedagógicas.',
    points: ['Reporte sindrómico para vigilancia', 'Circulares de salud a las familias', 'Crecimiento con percentiles de la OMS'],
    guide: '/ayuda/salud-publica',
  },
  {
    id: 'estadisticas',
    icon: <BarChart3 />,
    title: 'Estadísticas para decidir',
    text: 'Tablero con atenciones por día, motivos, diagnósticos, franjas horarias, accidentalidad por lugar y adherencia a la medicación, con exportación a Excel y PDF.',
    points: ['Filtros por sección, grado y grupo', 'Vista anónima para directivos', 'Exportación a CSV, Excel y PDF'],
    guide: '/ayuda/estadisticas-y-reportes',
  },
];

const STEPS = [
  { icon: <GraduationCap />, title: 'En el aula', text: 'El docente toca al estudiante, elige el motivo y la urgencia. El pase queda en camino y enfermería recibe el aviso.' },
  { icon: <Stethoscope />, title: 'En enfermería', text: 'La enfermera recibe al estudiante, registra la atención y decide la conducta: retorno al aula, observación, retiro por acudiente o traslado.' },
  { icon: <Bell />, title: 'Con la familia', text: 'El acudiente recibe un aviso sin información clínica y consulta el resumen en el portal. Si debe recogerlo, confirma quién irá.' },
  { icon: <DoorOpen />, title: 'En portería', text: 'Portería ve la foto del estudiante y de la persona autorizada, verifica el documento y registra la entrega. El pase se cierra solo.' },
];

const ROLES = [
  { title: 'Enfermería y médico', text: 'Tablero en vivo, atenciones, medicación, inventario y emergencias.', href: '/ayuda/rol-enfermeria' },
  { title: 'Docentes', text: 'Pase a enfermería en dos toques y seguimiento en tiempo real.', href: '/ayuda/rol-docente' },
  { title: 'Padres y acudientes', text: 'Ficha de salud, medicamentos, consentimientos y avisos.', href: '/ayuda/rol-padres-y-acudientes' },
  { title: 'Portería', text: 'Kiosco con PIN, verificación de identidad y entrega segura.', href: '/ayuda/rol-porteria' },
  { title: 'Coordinación de enfermería', text: 'Supervisión, anulaciones, aprobaciones y cumplimiento.', href: '/ayuda/rol-coordinacion-enfermeria' },
  { title: 'Psicología y orientación', text: 'Notas de salud mental cifradas y consultas frecuentes.', href: '/ayuda/rol-psicologia' },
  { title: 'Directivos', text: 'Estadísticas anónimas por sección y circulares de salud.', href: '/ayuda/rol-directivos' },
  { title: 'Administradores', text: 'Usuarios, permisos, configuración, Phidias y auditoría.', href: '/ayuda/rol-administrador' },
];

const SECURITY = [
  { icon: <Lock />, title: 'Aislamiento por colegio', text: 'Cada consulta a la base de datos está restringida al colegio del usuario mediante seguridad a nivel de fila.' },
  { icon: <ScrollText />, title: 'Registros inmutables', text: 'Las atenciones firmadas se encadenan con hash SHA-256. Se corrigen con adendas y se anulan con motivo; nunca se borran.' },
  { icon: <KeyRound />, title: 'Acceso protegido', text: 'Verificación en dos pasos, bloqueo por intentos fallidos, sesiones que expiran y permisos por rol editables.' },
  { icon: <ShieldCheck />, title: 'Datos cifrados', text: 'Adjuntos y notas de salud mental cifrados con AES-256. Los mensajes a las familias nunca incluyen diagnósticos.' },
  { icon: <FileSignature />, title: 'Consentimientos y derechos', text: 'Autorizaciones versionadas con firma por código, solicitudes de acceso y rectificación, y retención según la norma.' },
  { icon: <ClipboardList />, title: 'Auditoría completa', text: 'Quién vio o cambió cada historia clínica, con alerta de accesos inusuales y verificación de integridad.' },
];

const FAQ = [
  {
    q: '¿Qué es MediSchool?',
    a: 'MediSchool es un software de enfermería escolar que reúne en un solo lugar la historia clínica de los estudiantes, los pases del aula a la enfermería, la administración de medicamentos, la salida con acudiente por portería, el portal para las familias y las estadísticas de salud del colegio.',
  },
  {
    q: '¿Necesito instalar algo en los computadores o celulares?',
    a: 'No. MediSchool funciona en el navegador de computadores, tablets y celulares. Además puede instalarse como aplicación en la pantalla de inicio del celular y sigue funcionando para registrar pases cuando se pierde la conexión.',
  },
  {
    q: '¿Cómo se integra con Phidias?',
    a: 'MediSchool sincroniza automáticamente estudiantes, grados y grupos desde Phidias, así como las fotos de los estudiantes y el historial de atenciones registrado en las encuestas. La sincronización es idempotente y nunca sobrescribe la información clínica registrada en enfermería.',
  },
  {
    q: '¿Los padres reciben diagnósticos por WhatsApp o correo?',
    a: 'No. Los mensajes solo informan que hubo una novedad e invitan a consultar el detalle en el portal con usuario y contraseña. Los enlaces de confirmación de salida son firmados y de un solo uso.',
  },
  {
    q: '¿Qué pasa si una enfermera se equivoca en una atención?',
    a: 'Mientras la atención está abierta puede editarse. Una vez firmada queda inmutable: se agregan adendas con la corrección, y el médico o la coordinación pueden anularla indicando el motivo. Todo queda en la auditoría.',
  },
  {
    q: '¿Cumple con la ley de protección de datos en Colombia?',
    a: 'MediSchool incorpora los requisitos de la Ley 1581 de 2012, el Decreto 1377 de 2013, la Ley 1098 de 2006 y la Resolución 1995 de 1999: consentimientos informados, datos sensibles cifrados, derechos de los titulares, retención de historias clínicas y reportes obligatorios. También incluye perfiles legales para otros países.',
  },
  {
    q: '¿Qué roles de usuario incluye?',
    a: 'Enfermería, médico institucional, coordinación de enfermería, psicología u orientación, docentes, portería, padres y acudientes, estudiantes, directivos, administradores y superadministradores para grupos de colegios. Los permisos de cada rol se pueden ajustar.',
  },
  {
    q: '¿Dónde encuentro instrucciones de uso?',
    a: 'El centro de ayuda de MediSchool tiene guías detalladas por rol y por módulo, con pasos, capturas de pantalla y preguntas frecuentes.',
  },
];

function Screenshot({ src, alt, mobile = false, priority = false, className = '' }: { src: string; alt: string; mobile?: boolean; priority?: boolean; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-20px_rgb(15_103_97/0.35)] ${mobile ? 'rounded-[1.75rem] border-4 border-fg/10' : ''} ${className}`}>
      <img src={src} alt={alt} width={mobile ? 412 : 1280} height={mobile ? 915 : 800} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" className="h-auto w-full" />
    </div>
  );
}

export default function HomePage() {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE.name,
      applicationCategory: 'HealthApplication',
      applicationSubCategory: 'Software de enfermería escolar',
      operatingSystem: 'Web, Android, iOS, Windows, macOS',
      inLanguage: SITE.language,
      description: SITE.description,
      url: absoluteUrl('/'),
      image: absoluteUrl('/opengraph-image'),
      featureList: FEATURES.map((f) => f.title),
      screenshot: absoluteUrl('/ayuda/capturas/tablero-enfermeria.jpg'),
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name: SITE.name, url: absoluteUrl('/'), logo: absoluteUrl('/icon.svg') },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      url: absoluteUrl('/'),
      inLanguage: SITE.language,
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/ayuda')}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <SiteHeader />
      <main id="contenido">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-5xl rounded-full bg-primary-300/25 blur-3xl dark:bg-primary-700/20" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-800 dark:border-primary-800 dark:bg-primary-950 dark:text-primary-200">
                <HeartPulse className="h-3.5 w-3.5" aria-hidden /> Sistema de Gestión de Enfermería Escolar
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl">Software de enfermería escolar para colegios que cuidan cada detalle</h1>
              <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
                Historia clínica escolar, pases del aula a la enfermería, medicación con los 5 correctos, salida segura por portería y un portal para las familias. Todo conectado, en tiempo real y desde cualquier dispositivo.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/ayuda" className="inline-flex h-12 items-center rounded-xl bg-primary-700 px-5 font-medium text-white shadow-sm hover:bg-primary-800 dark:bg-primary-500 dark:text-[#06201e] dark:hover:bg-primary-400">
                  Conocer cómo funciona
                </Link>
                {SITE.contactEmail ? (
                  <a href={`mailto:${SITE.contactEmail}?subject=${encodeURIComponent('Demostración de MediSchool')}`} className="inline-flex h-12 items-center rounded-xl border border-border bg-card px-5 font-medium hover:bg-card-muted">
                    Solicitar una demostración
                  </a>
                ) : (
                  <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-border bg-card px-5 font-medium hover:bg-card-muted">
                    Iniciar sesión
                  </Link>
                )}
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-muted sm:grid-cols-2">
                {['Integrado con Phidias', 'Funciona en celular y sin conexión', 'Cumple la Ley 1581 de 2012', 'Registros firmados e inmutables'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-600" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <Screenshot src="/ayuda/capturas/tablero-enfermeria.jpg" alt="Tablero en vivo de enfermería con los estudiantes en camino, en sala, en observación y esperando acudiente" priority />
              <div className="absolute -bottom-10 -left-4 hidden w-40 sm:block lg:-left-10">
                <Screenshot src="/ayuda/capturas/docente-mi-clase-movil.jpg" alt="Vista del docente en el celular para enviar un estudiante a enfermería" mobile />
              </div>
            </div>
          </div>
        </section>

        {/* Value strip */}
        <section aria-label="Beneficios principales" className="border-y border-border bg-card">
          <dl className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {[
              ['2 toques', 'para que un docente envíe un estudiante a enfermería'],
              ['Tiempo real', 'estados del pase visibles para docente, enfermería y portería'],
              ['0 borrados', 'la historia clínica se corrige con adendas y se audita'],
              ['1 lugar', 'para salud, medicación, familias y estadísticas'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-2xl font-semibold tracking-tight text-primary-700 dark:text-primary-300">{k}</dt>
                <dd className="mt-1 text-sm text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Problem → solution */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">Del cuaderno y los mensajes sueltos a una enfermería escolar trazable</h2>
              <p className="mt-4 text-muted">
                En muchos colegios la información de salud vive en planillas, chats y encuestas. Cuando un estudiante con alergia severa llega a enfermería, cada segundo cuenta; cuando un acudiente pregunta qué pasó, la respuesta debe ser clara; y cuando alguien retira a un menor, la identidad debe verificarse.
              </p>
            </div>
            <ul className="grid gap-3">
              {[
                ['¿Llegó el estudiante a enfermería?', 'El docente lo ve en su celular y recibe una alerta si no llega.'],
                ['¿Tiene alergias o una condición crítica?', 'La alerta aparece en todas las pantallas donde se ve al estudiante.'],
                ['¿Se le dio el medicamento a la hora correcta?', 'Cada dosis queda registrada con verificación y aviso a la familia.'],
                ['¿Quién se lo llevó y a qué hora?', 'Portería verifica el documento y la salida queda firmada.'],
              ].map(([q, a]) => (
                <li key={q} className="rounded-2xl border border-border bg-card p-5">
                  <p className="font-medium">{q}</p>
                  <p className="mt-1 text-sm text-muted">{a}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="funcionalidades" className="scroll-mt-20 bg-card-muted/60 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Funcionalidades</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Todo lo que la enfermería de un colegio necesita</h2>
              <p className="mt-3 text-muted">Cada módulo tiene una guía paso a paso en el centro de ayuda.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.id} id={f.id} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300 [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
                    {f.icon}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted">{f.text}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /> {p}
                      </li>
                    ))}
                  </ul>
                  <Link href={f.guide} className="mt-5 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                    Ver la guía de {f.title.toLowerCase()} →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Cómo funciona</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Un recorrido trazable del aula a la portería</h2>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
                <span className="absolute right-5 top-5 text-sm font-semibold text-muted tabular">0{i + 1}</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-700 text-white [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
                  {s.icon}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
            <figure>
              <Screenshot src="/ayuda/capturas/atencion-clinica.jpg" alt="Pantalla de atención de enfermería con motivo, signos vitales, notas SOAP y diagnóstico" />
              <figcaption className="mt-3 text-sm text-muted">La atención completa en una sola pantalla, con guardado automático.</figcaption>
            </figure>
            <figure>
              <Screenshot src="/ayuda/capturas/porteria.jpg" alt="Pantalla de portería con los estudiantes listos para salir y la persona autorizada" />
              <figcaption className="mt-3 text-sm text-muted">Portería entrega solo a la persona confirmada por la familia.</figcaption>
            </figure>
          </div>
        </section>

        {/* Families */}
        <section className="bg-primary-800 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_0.7fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">Las familias, informadas y tranquilas</h2>
              <p className="mt-4 text-white/80">
                El portal para padres y acudientes funciona en el celular sin instalar nada. Muestra el estado de salud de cada hijo en el colegio hoy, las visitas a enfermería con su resumen y las dosis administradas.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  [<HeartPulse key="h" />, 'Ficha de salud siempre actualizada'],
                  [<Pill key="p" />, 'Solicitud de medicamentos con la fórmula'],
                  [<FileSignature key="f" />, 'Consentimientos firmados en línea'],
                  [<MessageSquare key="m" />, 'Mensajes directos con enfermería'],
                  [<DoorOpen key="d" />, 'Confirmación de quién recoge'],
                  [<Smartphone key="s" />, 'Avisos en la app, correo o WhatsApp'],
                ].map(([icon, label]) => (
                  <li key={String(label)} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm [&_svg]:h-4 [&_svg]:w-4">
                    {icon} {label}
                  </li>
                ))}
              </ul>
              <Link href="/ayuda/rol-padres-y-acudientes" className="mt-8 inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-medium text-primary-900 hover:bg-primary-50">
                Guía para padres y acudientes
              </Link>
            </div>
            <div className="mx-auto w-full max-w-[18rem]">
              <Screenshot src="/ayuda/capturas/familia-inicio-movil.jpg" alt="Inicio del portal de familias en el celular con el estado de salud del estudiante" mobile />
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Roles</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Cada persona ve exactamente lo que necesita</h2>
            <p className="mt-3 text-muted">Los docentes ven que un estudiante tiene una alerta médica, pero no su diagnóstico. Portería ve la identificación y la persona autorizada. Los directivos ven cifras anónimas.</p>
          </div>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <li key={r.title}>
                <Link href={r.href} className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 hover:border-primary-400">
                  <span className="flex items-center gap-2 font-semibold">
                    <Users className="h-4 w-4 text-primary-600" aria-hidden /> {r.title}
                  </span>
                  <span className="mt-2 text-sm text-muted">{r.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Stats */}
        <section className="bg-card-muted/60 py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Estadísticas</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Información para prevenir, no solo para reaccionar</h2>
              <p className="mt-4 text-muted">
                Identifique en qué franjas horarias y lugares ocurren más accidentes, qué motivos se repiten por grado, qué estudiantes consultan con frecuencia y cómo va la adherencia a la medicación. Compare con el año anterior y exporte a CSV, Excel o PDF.
              </p>
              <Link href="/ayuda/estadisticas-y-reportes" className="mt-6 inline-flex text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                Ver la guía de estadísticas →
              </Link>
            </div>
            <Screenshot src="/ayuda/capturas/estadisticas.jpg" alt="Tablero de estadísticas con atenciones por día, motivos frecuentes y accidentalidad por lugar" />
          </div>
        </section>

        {/* Security */}
        <section id="seguridad" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Seguridad y cumplimiento</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Diseñado para datos de salud de menores de edad</h2>
            <p className="mt-3 text-muted">Cumple la Ley 1581 de 2012, el Decreto 1377 de 2013, la Ley 1098 de 2006 y la Resolución 1995 de 1999, con perfiles legales para otros países.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map((s) => (
              <div key={s.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="text-primary-700 dark:text-primary-300 [&_svg]:h-6 [&_svg]:w-6" aria-hidden>
                  {s.icon}
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Integrations */}
        <section id="integraciones" className="scroll-mt-20 border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Conectado con lo que el colegio ya usa</h2>
              <p className="mt-3 text-muted">La información académica llega sola y la comunicación sale por el canal que prefiere cada familia.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                [<RefreshCw key="r" />, 'Phidias', 'Estudiantes, grados, grupos, fotos e historial de encuestas, con sincronización automática.'],
                [<Bell key="b" />, 'Notificaciones', 'En la aplicación, correo electrónico, WhatsApp, SMS y notificaciones push, con horario de silencio.'],
                [<CloudOff key="c" />, 'Sin conexión', 'Los pases y registros urgentes se guardan en el dispositivo y se envían al reconectar.'],
                [<Smartphone key="s" />, 'Aplicación instalable', 'Se agrega a la pantalla de inicio de Android, iPhone y computadores.'],
              ].map(([icon, title, text]) => (
                <li key={String(title)} className="rounded-2xl border border-border p-5">
                  <p className="flex items-center gap-2 font-semibold text-fg [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary-600">
                    {icon} {title}
                  </p>
                  <p className="mt-2 text-sm text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base">{f.q}</h3>
                  <span aria-hidden className="text-xl text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-gradient-to-br from-primary-700 to-primary-900 px-6 py-14 text-center text-white sm:px-12">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">Una enfermería escolar más segura empieza hoy</h2>
            <p className="mx-auto mt-3 max-w-2xl text-white/80">Explore las guías de cada rol y descubra cómo MediSchool acompaña a enfermería, docentes, familias y directivos.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/ayuda" className="inline-flex h-12 items-center rounded-xl bg-white px-5 font-medium text-primary-900 hover:bg-primary-50">
                Ir al centro de ayuda
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-white/40 px-5 font-medium hover:bg-white/10">
                Iniciar sesión
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
