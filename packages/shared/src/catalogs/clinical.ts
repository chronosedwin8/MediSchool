/** Clinical catalogs used across API, seeds and UI (es-CO). */

export const ENCOUNTER_TYPES = [
  'ILLNESS',
  'ACCIDENT',
  'MENTAL_HEALTH',
  'CHRONIC_CONTROL',
  'SCHEDULED_MEDICATION',
  'WOUND_CARE',
  'ASSESSMENT',
  'SCREENING',
  'STAFF_FIRST_AID',
  'FOLLOW_UP',
] as const;
export type EncounterType = (typeof ENCOUNTER_TYPES)[number];
export const ENCOUNTER_TYPE_LABELS: Record<EncounterType, string> = {
  ILLNESS: 'Enfermedad general',
  ACCIDENT: 'Accidente / trauma',
  MENTAL_HEALTH: 'Salud mental / emocional',
  CHRONIC_CONTROL: 'Control de condición crónica',
  SCHEDULED_MEDICATION: 'Medicamento programado',
  WOUND_CARE: 'Curación',
  ASSESSMENT: 'Valoración',
  SCREENING: 'Tamizaje',
  STAFF_FIRST_AID: 'Primeros auxilios a personal',
  FOLLOW_UP: 'Seguimiento / llamada',
};

export const DISPOSITIONS = [
  'RETURN_TO_CLASS',
  'GUARDIAN_PICKUP',
  'TRANSFER_IPS',
  'STAFF_RETURN_TO_WORK',
  'STAFF_SENT_HOME',
  'COORDINATION_REPORT',
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export const DISPOSITION_LABELS: Record<Disposition, string> = {
  RETURN_TO_CLASS: 'Retorno al aula',
  GUARDIAN_PICKUP: 'Retiro por acudiente',
  TRANSFER_IPS: 'Traslado a IPS',
  STAFF_RETURN_TO_WORK: 'Retorno al puesto de trabajo',
  STAFF_SENT_HOME: 'Envío a casa (personal)',
  COORDINATION_REPORT: 'Reporte a coordinación',
};

export const ENCOUNTER_STATUSES = ['OPEN', 'OBSERVATION', 'CLOSED', 'ANNULLED'] as const;
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

export const ALLERGY_CATEGORIES = ['MEDICATION', 'FOOD', 'ENVIRONMENTAL', 'INSECT', 'LATEX', 'OTHER'] as const;
export const ALLERGY_CATEGORY_LABELS: Record<(typeof ALLERGY_CATEGORIES)[number], string> = {
  MEDICATION: 'Medicamento',
  FOOD: 'Alimento',
  ENVIRONMENTAL: 'Ambiental',
  INSECT: 'Insecto',
  LATEX: 'Látex',
  OTHER: 'Otra',
};
export const ALLERGY_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'ANAPHYLAXIS'] as const;
export const ALLERGY_SEVERITY_LABELS: Record<(typeof ALLERGY_SEVERITIES)[number], string> = {
  MILD: 'Leve',
  MODERATE: 'Moderada',
  SEVERE: 'Severa',
  ANAPHYLAXIS: 'Anafilaxia',
};

export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;

export const SCREENING_TYPES = ['VISUAL', 'HEARING', 'POSTURAL', 'ORAL', 'DEVELOPMENT', 'NUTRITIONAL', 'PEDICULOSIS'] as const;
export const SCREENING_TYPE_LABELS: Record<(typeof SCREENING_TYPES)[number], string> = {
  VISUAL: 'Agudeza visual',
  HEARING: 'Auditivo',
  POSTURAL: 'Postural',
  ORAL: 'Salud oral',
  DEVELOPMENT: 'Desarrollo (preescolar)',
  NUTRITIONAL: 'Nutricional',
  PEDICULOSIS: 'Pediculosis',
};

export const COMMON_CONDITIONS = [
  { name: 'Asma', icd10: 'J45.9', critical: true },
  { name: 'Diabetes mellitus tipo 1', icd10: 'E10.9', critical: true },
  { name: 'Epilepsia', icd10: 'G40.9', critical: true },
  { name: 'Cardiopatía congénita', icd10: 'Q24.9', critical: true },
  { name: 'Hemofilia A', icd10: 'D66', critical: true },
  { name: 'Enfermedad celíaca', icd10: 'K90.0', critical: false },
  { name: 'TDAH', icd10: 'F90.0', critical: false },
  { name: 'Trastorno del espectro autista', icd10: 'F84.0', critical: false },
  { name: 'Rinitis alérgica', icd10: 'J30.4', critical: false },
  { name: 'Migraña', icd10: 'G43.9', critical: false },
  { name: 'Obesidad', icd10: 'E66.9', critical: false },
  { name: 'Dermatitis atópica', icd10: 'L20.9', critical: false },
];

/** Vaccines of the Colombian PAI relevant to school age (profile CO). */
export const VACCINES_PAI_CO = [
  'BCG',
  'Hepatitis B',
  'Pentavalente (DPT-HB-Hib)',
  'Hexavalente',
  'Polio (VIP/VOP)',
  'Rotavirus',
  'Neumococo',
  'Influenza',
  'Triple viral (SRP)',
  'Fiebre amarilla',
  'Hepatitis A',
  'Varicela',
  'DPT refuerzo',
  'VPH',
  'Td / Tdap',
  'COVID-19',
];

export interface EncounterTemplate {
  key: string;
  label: string;
  type: EncounterType;
  icd10: { code: string; description: string }[];
  checklist: string[];
  actions: string[];
  redFlags: string[];
  observationMinutes: number;
  protocolKey?: string;
}

export const ENCOUNTER_TEMPLATES: EncounterTemplate[] = [
  {
    key: 'headache',
    label: 'Cefalea',
    type: 'ILLNESS',
    icd10: [{ code: 'R51', description: 'Cefalea' }, { code: 'G44.2', description: 'Cefalea debida a tensión' }],
    checklist: ['Inicio y duración', 'Intensidad EVA', 'Fotofobia / fonofobia', 'Vómito asociado', 'Trauma reciente', 'Fiebre', 'Hidratación / alimentación'],
    actions: ['Reposo en ambiente tranquilo', 'Hidratación oral', 'Analgésico si hay autorización y sin alergia'],
    redFlags: ['Cefalea súbita intensa', 'Rigidez de nuca', 'Alteración de conciencia', 'Déficit neurológico', 'Posterior a trauma craneal'],
    observationMinutes: 20,
  },
  {
    key: 'abdominal_pain',
    label: 'Dolor abdominal',
    type: 'ILLNESS',
    icd10: [{ code: 'R10.4', description: 'Otros dolores abdominales y los no especificados' }, { code: 'K30', description: 'Dispepsia' }],
    checklist: ['Localización', 'Tiempo de evolución', 'Vómito / diarrea', 'Última comida', 'Fiebre', 'Dolor a la palpación / rebote'],
    actions: ['Reposo', 'Hidratación en pequeños sorbos', 'Vigilar evolución'],
    redFlags: ['Dolor en fosa iliaca derecha', 'Abdomen rígido', 'Vómito persistente o con sangre', 'Deshidratación'],
    observationMinutes: 30,
  },
  {
    key: 'contusion',
    label: 'Contusión / golpe',
    type: 'ACCIDENT',
    icd10: [{ code: 'T14.0', description: 'Traumatismo superficial de región no especificada del cuerpo' }],
    checklist: ['Mecanismo del trauma', 'Lugar del accidente', 'Deformidad', 'Edema', 'Movilidad conservada', 'Dolor EVA'],
    actions: ['Frío local 15 minutos', 'Elevación del miembro', 'Inmovilización si hay sospecha de fractura'],
    redFlags: ['Deformidad evidente', 'Imposibilidad de apoyo o movilidad', 'Dolor intenso persistente'],
    observationMinutes: 15,
  },
  {
    key: 'head_trauma',
    label: 'Trauma craneal',
    type: 'ACCIDENT',
    icd10: [{ code: 'S09.9', description: 'Traumatismo de la cabeza, no especificado' }, { code: 'S00.9', description: 'Traumatismo superficial de la cabeza, parte no especificada' }],
    checklist: ['Glasgow', 'Pérdida de conciencia', 'Amnesia', 'Vómito', 'Pupilas', 'Cefalea progresiva'],
    actions: ['Glasgow cada 15 min', 'Frío local', 'Notificar al acudiente siempre'],
    redFlags: ['Glasgow < 15', 'Pérdida de conciencia', 'Vómito repetido', 'Convulsión', 'Salida de líquido por nariz u oído'],
    observationMinutes: 30,
    protocolKey: 'head_trauma',
  },
  {
    key: 'epistaxis',
    label: 'Epistaxis',
    type: 'ILLNESS',
    icd10: [{ code: 'R04.0', description: 'Epistaxis' }],
    checklist: ['Trauma previo', 'Duración', 'Cantidad', 'Antecedente de coagulopatía'],
    actions: ['Sentado, cabeza ligeramente hacia adelante', 'Presión digital 10 minutos', 'Frío local'],
    redFlags: ['Sangrado > 20 min', 'Hemofilia / anticoagulación', 'Signos de inestabilidad'],
    observationMinutes: 15,
  },
  {
    key: 'fever',
    label: 'Fiebre',
    type: 'ILLNESS',
    icd10: [{ code: 'R50.9', description: 'Fiebre, no especificada' }],
    checklist: ['Temperatura', 'Síntomas respiratorios', 'Síntomas gastrointestinales', 'Erupción cutánea', 'Estado general'],
    actions: ['Medios físicos', 'Antipirético si autorizado', 'Aislar de otros estudiantes', 'Notificar al acudiente para retiro'],
    redFlags: ['T° ≥ 39.5 °C', 'Petequias', 'Letargia', 'Rigidez de nuca', 'Dificultad respiratoria'],
    observationMinutes: 30,
  },
  {
    key: 'asthma_attack',
    label: 'Crisis asmática',
    type: 'CHRONIC_CONTROL',
    icd10: [{ code: 'J45.9', description: 'Asma, no especificada' }, { code: 'J46', description: 'Estado asmático' }],
    checklist: ['SatO₂', 'Frecuencia respiratoria', 'Uso de músculos accesorios', 'Capacidad para hablar', 'Plan de acción individual'],
    actions: ['Salbutamol según plan de acción', 'Posición sentada', 'Reevaluar a los 20 min'],
    redFlags: ['SatO₂ < 92 %', 'No puede hablar frases', 'Cianosis', 'Sin respuesta a 2 ciclos de broncodilatador'],
    observationMinutes: 20,
    protocolKey: 'asthma',
  },
  {
    key: 'hypoglycemia',
    label: 'Hipoglucemia',
    type: 'CHRONIC_CONTROL',
    icd10: [{ code: 'E16.2', description: 'Hipoglucemia, no especificada' }],
    checklist: ['Glucometría', 'Estado de conciencia', 'Última dosis de insulina', 'Última comida'],
    actions: ['Regla 15-15: 15 g de carbohidrato de absorción rápida', 'Repetir glucometría a los 15 min', 'Colación al normalizar'],
    redFlags: ['Glucosa < 54 mg/dL', 'Alteración de conciencia', 'Convulsión', 'Incapacidad para tragar → glucagón'],
    observationMinutes: 15,
    protocolKey: 'hypoglycemia',
  },
  {
    key: 'seizure',
    label: 'Crisis convulsiva',
    type: 'CHRONIC_CONTROL',
    icd10: [{ code: 'R56.8', description: 'Otras convulsiones y las no especificadas' }, { code: 'G40.9', description: 'Epilepsia, tipo no especificado' }],
    checklist: ['Hora de inicio', 'Duración', 'Tipo de crisis', 'Glucometría', 'Trauma asociado'],
    actions: ['Proteger de lesiones', 'Posición lateral de seguridad', 'Cronometrar', 'Medicación de rescate según plan'],
    redFlags: ['Duración > 5 min', 'Crisis repetidas sin recuperación', 'Dificultad respiratoria', 'Primera crisis'],
    observationMinutes: 30,
    protocolKey: 'seizure',
  },
  {
    key: 'allergic_reaction',
    label: 'Reacción alérgica',
    type: 'ILLNESS',
    icd10: [{ code: 'T78.4', description: 'Alergia no especificada' }, { code: 'L50.9', description: 'Urticaria, no especificada' }, { code: 'T78.2', description: 'Choque anafiláctico, no especificado' }],
    checklist: ['Desencadenante', 'Lesiones cutáneas', 'Edema de labios / lengua', 'Dificultad respiratoria', 'Tensión arterial'],
    actions: ['Retirar desencadenante', 'Antihistamínico si autorizado', 'Epinefrina ante anafilaxia'],
    redFlags: ['Compromiso respiratorio', 'Hipotensión', 'Edema de glotis', 'Dos o más sistemas comprometidos'],
    observationMinutes: 30,
    protocolKey: 'anaphylaxis',
  },
  {
    key: 'anxiety',
    label: 'Ansiedad / crisis emocional',
    type: 'MENTAL_HEALTH',
    icd10: [{ code: 'F41.9', description: 'Trastorno de ansiedad, no especificado' }, { code: 'F43.0', description: 'Reacción al estrés agudo' }],
    checklist: ['Desencadenante', 'Respiración', 'Ideas de autolesión', 'Red de apoyo', 'Episodios previos'],
    actions: ['Espacio seguro y tranquilo', 'Respiración guiada', 'Remitir a orientación escolar'],
    redFlags: ['Ideación suicida', 'Autolesiones', 'Sospecha de maltrato o abuso (activar ruta ICBF)'],
    observationMinutes: 20,
  },
  {
    key: 'menstrual_pain',
    label: 'Dismenorrea',
    type: 'ILLNESS',
    icd10: [{ code: 'N94.6', description: 'Dismenorrea, no especificada' }],
    checklist: ['Intensidad EVA', 'Fecha de última menstruación', 'Síntomas asociados'],
    actions: ['Calor local', 'Reposo', 'Analgésico si autorizado'],
    redFlags: ['Dolor desproporcionado', 'Sangrado abundante', 'Síncope'],
    observationMinutes: 20,
  },
  {
    key: 'wound',
    label: 'Herida / raspadura',
    type: 'WOUND_CARE',
    icd10: [{ code: 'T14.1', description: 'Herida de región no especificada del cuerpo' }, { code: 'T14.0', description: 'Traumatismo superficial de región no especificada del cuerpo' }],
    checklist: ['Extensión y profundidad', 'Cuerpo extraño', 'Sangrado', 'Esquema de tétanos'],
    actions: ['Lavado con solución salina', 'Antisepsia', 'Cubrir con apósito'],
    redFlags: ['Herida profunda o que requiere sutura', 'Sangrado que no cede', 'Mordedura animal'],
    observationMinutes: 0,
  },
];

export const EMERGENCY_PROTOCOLS: { key: string; title: string; steps: string[] }[] = [
  {
    key: 'anaphylaxis',
    title: 'Anafilaxia',
    steps: [
      'Llamar a emergencias (123) y pedir DEA/botiquín.',
      'Epinefrina IM en cara anterolateral del muslo: 0,01 mg/kg (máx. 0,3 mg; autoinyector 0,15 mg si < 25 kg, 0,3 mg si ≥ 25 kg).',
      'Posición supina con piernas elevadas (sentado si hay dificultad respiratoria).',
      'Repetir epinefrina a los 5–15 min si no hay mejoría.',
      'Oxígeno si está disponible; vigilar vía aérea y signos vitales.',
      'Notificar al acudiente y trasladar a IPS aunque mejore.',
    ],
  },
  {
    key: 'seizure',
    title: 'Convulsión',
    steps: [
      'Proteger la cabeza, retirar objetos cercanos. No introducir nada en la boca.',
      'Cronometrar la crisis.',
      'Posición lateral de seguridad al terminar el movimiento.',
      'Si dura > 5 min: medicación de rescate según plan individual y llamar al 123.',
      'Glucometría. Notificar al acudiente.',
    ],
  },
  {
    key: 'asthma',
    title: 'Crisis asmática',
    steps: [
      'Sentar al estudiante, mantener la calma.',
      'Salbutamol con inhalocámara: 2–4 inhalaciones cada 20 min (hasta 3 ciclos) según plan.',
      'Medir SatO₂ y frecuencia respiratoria.',
      'Si SatO₂ < 92 %, no habla o no mejora: llamar al 123 y trasladar.',
    ],
  },
  {
    key: 'hypoglycemia',
    title: 'Hipoglucemia',
    steps: [
      'Si está consciente y puede tragar: 15 g de carbohidrato rápido.',
      'Repetir glucometría en 15 min; repetir si < 70 mg/dL.',
      'Si está inconsciente: NO dar nada por boca, glucagón según plan, posición lateral, llamar al 123.',
    ],
  },
  {
    key: 'head_trauma',
    title: 'Trauma craneal',
    steps: [
      'No mover si hay sospecha de lesión cervical.',
      'Evaluar Glasgow, pupilas y conciencia.',
      'Signos de alarma (pérdida de conciencia, vómito, convulsión, Glasgow < 15): llamar al 123.',
      'Observación mínima de 30 min y notificación al acudiente.',
    ],
  },
  {
    key: 'cpr',
    title: 'RCP',
    steps: [
      'Verificar seguridad de la escena y respuesta.',
      'Llamar al 123 y pedir el DEA.',
      '30 compresiones (100–120/min, 1/3 del diámetro del tórax) : 2 ventilaciones.',
      'Usar el DEA apenas llegue y seguir sus instrucciones.',
    ],
  },
  {
    key: 'choking',
    title: 'Atragantamiento',
    steps: [
      'Si tose eficazmente: animar a toser.',
      'Si no puede toser, hablar ni respirar: 5 golpes interescapulares + 5 compresiones abdominales (Heimlich).',
      'Si pierde la conciencia: iniciar RCP y llamar al 123.',
    ],
  },
];

/** Real school zones (Colegio Alemán de Barranquilla, from Phidias poll 114). */
export const SCHOOL_ZONES = [
  'Salón de clases',
  'Parque de Kindergarten',
  'Parque de Primaria',
  'Polideportivo',
  'Pasillo/hall de primaria',
  'Pasillo/hall de bachillerato',
  'Pasillo/hall Kindergarten',
  'Pasillo/Hall/Rampas',
  'Cancha de Futbol',
  'Cancha sintética',
  'Cancha Sintética Mini',
  'Pista Atlética',
  'Piscina de niños',
  'Piscina de adultos',
  'Plataforma de entrada',
  'Plataforma de primaria',
  'Plataforma de bachillerato',
  'Comedor/Mensa',
  'Baños',
  'Biblioteca',
  'Tienda o quiosco escolar',
  'Ecoparque',
  'Media Torta',
  'Parque De La Montaña',
  'Transporte escolar',
  'Salida pedagógica',
  'Otro',
];

/** Quick reason chips for teachers (most frequent motives in the school). */
export const PASS_REASON_CHIPS = [
  'Dolor de cabeza',
  'Malestar estomacal',
  'Golpe / caída',
  'Raspadura / herida',
  'Dolor de garganta',
  'Malestar general',
  'Fiebre',
  'Dolor muscular',
  'Cólico menstrual',
  'Alergia / picadura',
  'Sangrado nasal',
  'Crisis emocional',
  'Dificultad para respirar',
  'Medicamento programado',
  'Otro',
];

const REASON_TEMPLATE_KEYS: [RegExp, string][] = [
  [/cabeza|cefalea|migra/i, 'headache'],
  [/estomac|abdom|barriga|v[oó]mit|n[aá]usea/i, 'abdominal_pain'],
  [/golpe|ca[ií]da|contusi/i, 'contusion'],
  [/raspad|herida|cortad/i, 'wound'],
  [/fiebre|temperatura/i, 'fever'],
  [/c[oó]lico menstrual|menstrua|dismenorrea/i, 'menstrual_pain'],
  [/alergia|picadura|urticaria/i, 'allergic_reaction'],
  [/sangrado nasal|nariz|epistaxis/i, 'epistaxis'],
  [/emocional|ansiedad|llanto|p[aá]nico/i, 'anxiety'],
  [/respirar|asma|ahogo/i, 'asthma_attack'],
  [/convuls/i, 'seizure'],
  [/hipoglucemia|az[uú]car/i, 'hypoglycemia'],
];

/** Suggests an encounter template from a free-text reason (e.g. the teacher's pass chip). */
export function templateKeyForReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REASON_TEMPLATE_KEYS.find(([re]) => re.test(reason))?.[1] ?? null;
}

export const ACCIDENT_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'] as const;
export const ACCIDENT_SEVERITY_LABELS: Record<(typeof ACCIDENT_SEVERITIES)[number], string> = {
  MILD: 'Leve',
  MODERATE: 'Moderado',
  SEVERE: 'Grave',
};

export const PHYSICAL_EXAM_SYSTEMS = [
  'Estado general',
  'Piel y mucosas',
  'Cabeza y cuello',
  'Ojos',
  'Oídos, nariz y garganta',
  'Cardiopulmonar',
  'Abdomen',
  'Musculoesquelético',
  'Neurológico',
  'Estado emocional',
];
