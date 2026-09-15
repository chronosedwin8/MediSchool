'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const LOCALES = ['es-CO', 'es', 'en', 'de', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = { 'es-CO': 'Español (Colombia)', es: 'Español', en: 'English', de: 'Deutsch', pt: 'Português' };

type Dict = Record<string, string>;

const es: Dict = {
  'nav.board': 'Tablero en vivo',
  'nav.encounters': 'Atenciones',
  'nav.students': 'Estudiantes',
  'nav.medication': 'Medicación',
  'nav.inventory': 'Inventario',
  'nav.messages': 'Mensajes',
  'nav.stats': 'Estadísticas',
  'nav.publicHealth': 'Salud pública',
  'nav.admin': 'Administración',
  'nav.teacher': 'Mi clase',
  'nav.gate': 'Portería',
  'nav.family': 'Inicio',
  'nav.familyHealth': 'Ficha de salud',
  'nav.familyMeds': 'Medicamentos',
  'nav.consents': 'Consentimientos',
  'nav.circulars': 'Circulares',
  'nav.profile': 'Mi perfil',
  'nav.myPass': 'Mi pase',
  'action.emergency': 'EMERGENCIA',
  'action.search': 'Buscar estudiante o acción…',
  'action.logout': 'Cerrar sesión',
  'action.save': 'Guardar',
  'action.cancel': 'Cancelar',
  'action.confirm': 'Confirmar',
  'action.close': 'Cerrar',
  'action.export': 'Exportar',
  'state.offline': 'Sin conexión: las acciones se guardarán y enviarán al reconectar.',
  'state.queued': 'acciones pendientes de envío',
  'state.loading': 'Cargando…',
  'state.empty': 'Sin registros',
  'auth.login': 'Iniciar sesión',
  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.kiosk': 'Kiosco de portería',
  'theme.toggle': 'Cambiar tema',
};

const en: Dict = {
  'nav.board': 'Live board',
  'nav.encounters': 'Encounters',
  'nav.students': 'Students',
  'nav.medication': 'Medication',
  'nav.inventory': 'Inventory',
  'nav.messages': 'Messages',
  'nav.stats': 'Statistics',
  'nav.publicHealth': 'Public health',
  'nav.admin': 'Administration',
  'nav.teacher': 'My class',
  'nav.gate': 'Gate',
  'nav.family': 'Home',
  'nav.familyHealth': 'Health record',
  'nav.familyMeds': 'Medication',
  'nav.consents': 'Consents',
  'nav.circulars': 'Circulars',
  'nav.profile': 'My profile',
  'nav.myPass': 'My pass',
  'action.emergency': 'EMERGENCY',
  'action.search': 'Search student or action…',
  'action.logout': 'Sign out',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.confirm': 'Confirm',
  'action.close': 'Close',
  'action.export': 'Export',
  'state.offline': 'Offline: actions will be saved and sent when reconnected.',
  'state.queued': 'actions waiting to be sent',
  'state.loading': 'Loading…',
  'state.empty': 'No records',
  'auth.login': 'Sign in',
  'auth.email': 'E-mail',
  'auth.password': 'Password',
  'auth.kiosk': 'Gate kiosk',
  'theme.toggle': 'Toggle theme',
};

const de: Dict = {
  'nav.board': 'Live-Übersicht',
  'nav.encounters': 'Behandlungen',
  'nav.students': 'Schüler',
  'nav.medication': 'Medikation',
  'nav.inventory': 'Inventar',
  'nav.messages': 'Nachrichten',
  'nav.stats': 'Statistik',
  'nav.publicHealth': 'Gesundheitsschutz',
  'nav.admin': 'Verwaltung',
  'nav.teacher': 'Meine Klasse',
  'nav.gate': 'Pforte',
  'nav.family': 'Start',
  'nav.familyHealth': 'Gesundheitsbogen',
  'nav.familyMeds': 'Medikamente',
  'nav.consents': 'Einwilligungen',
  'nav.circulars': 'Rundschreiben',
  'nav.profile': 'Mein Profil',
  'nav.myPass': 'Mein Pass',
  'action.emergency': 'NOTFALL',
  'action.search': 'Schüler oder Aktion suchen…',
  'action.logout': 'Abmelden',
  'action.save': 'Speichern',
  'action.cancel': 'Abbrechen',
  'action.confirm': 'Bestätigen',
  'action.close': 'Schließen',
  'action.export': 'Exportieren',
  'state.offline': 'Offline: Aktionen werden gespeichert und später gesendet.',
  'state.queued': 'Aktionen warten auf Versand',
  'state.loading': 'Wird geladen…',
  'state.empty': 'Keine Einträge',
  'auth.login': 'Anmelden',
  'auth.email': 'E-Mail',
  'auth.password': 'Passwort',
  'auth.kiosk': 'Pforten-Kiosk',
  'theme.toggle': 'Design wechseln',
};

const pt: Dict = {
  'nav.board': 'Painel ao vivo',
  'nav.encounters': 'Atendimentos',
  'nav.students': 'Alunos',
  'nav.medication': 'Medicação',
  'nav.inventory': 'Estoque',
  'nav.messages': 'Mensagens',
  'nav.stats': 'Estatísticas',
  'nav.publicHealth': 'Saúde pública',
  'nav.admin': 'Administração',
  'nav.teacher': 'Minha turma',
  'nav.gate': 'Portaria',
  'nav.family': 'Início',
  'nav.familyHealth': 'Ficha de saúde',
  'nav.familyMeds': 'Medicamentos',
  'nav.consents': 'Consentimentos',
  'nav.circulars': 'Circulares',
  'nav.profile': 'Meu perfil',
  'nav.myPass': 'Meu passe',
  'action.emergency': 'EMERGÊNCIA',
  'action.search': 'Buscar aluno ou ação…',
  'action.logout': 'Sair',
  'action.save': 'Salvar',
  'action.cancel': 'Cancelar',
  'action.confirm': 'Confirmar',
  'action.close': 'Fechar',
  'action.export': 'Exportar',
  'state.offline': 'Sem conexão: as ações serão enviadas ao reconectar.',
  'state.queued': 'ações aguardando envio',
  'state.loading': 'Carregando…',
  'state.empty': 'Sem registros',
  'auth.login': 'Entrar',
  'auth.email': 'E-mail',
  'auth.password': 'Senha',
  'auth.kiosk': 'Quiosque da portaria',
  'theme.toggle': 'Alternar tema',
};

const DICTS: Record<Locale, Dict> = { 'es-CO': es, es, en, de, pt };

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const Ctx = createContext<I18n>({ locale: 'es-CO', setLocale: () => {}, t: (k, f) => es[k] ?? f ?? k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es-CO');
  useEffect(() => {
    const saved = localStorage.getItem('sgee:locale') as Locale | null;
    if (saved && LOCALES.includes(saved)) setLocaleState(saved);
  }, []);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('sgee:locale', l);
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18n>(() => ({ locale, setLocale, t: (key, fallback) => DICTS[locale][key] ?? es[key] ?? fallback ?? key }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
