'use client';

import { Badge, Button, cn, Select } from '@sgee/ui';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  DoorOpen,
  FileSignature,
  GraduationCap,
  HeartPulse,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Pill,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Siren,
  Sun,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/app/providers';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';
import { LOCALE_LABELS, LOCALES, type Locale, useI18n } from '@/lib/i18n';
import { useLive } from '@/lib/live';
import { offlineQueue } from '@/lib/offline-queue';
import { can, hasRole, type Me, useLogout } from '@/lib/session';
import { Dialog, Popover } from './dialog';
import { EmergencyDialog } from './emergency-dialog';
import { useDebounced, type StudentRow } from './student-picker';

interface NavItem {
  href: string;
  key: string;
  icon: ReactNode;
  show: (me: Me) => boolean;
}

const NAV: NavItem[] = [
  { href: '/enfermeria', key: 'nav.board', icon: <LayoutDashboard />, show: (m) => can(m, 'passes:nursing') },
  { href: '/enfermeria/atenciones', key: 'nav.encounters', icon: <HeartPulse />, show: (m) => can(m, 'encounters:read') },
  { href: '/enfermeria/medicacion', key: 'nav.medication', icon: <Pill />, show: (m) => can(m, 'meds:administer') },
  { href: '/enfermeria/inventario', key: 'nav.inventory', icon: <Boxes />, show: (m) => can(m, 'inventory:read') },
  { href: '/docente', key: 'nav.teacher', icon: <GraduationCap />, show: (m) => hasRole(m, 'TEACHER') },
  { href: '/porteria', key: 'nav.gate', icon: <DoorOpen />, show: (m) => can(m, 'gate:checkout') },
  { href: '/familia', key: 'nav.family', icon: <Home />, show: (m) => can(m, 'guardian:portal') },
  { href: '/familia/medicacion', key: 'nav.familyMeds', icon: <Pill />, show: (m) => can(m, 'guardian:portal') },
  { href: '/familia/consentimientos', key: 'nav.consents', icon: <FileSignature />, show: (m) => can(m, 'guardian:portal') },
  { href: '/familia/circulares', key: 'nav.circulars', icon: <Megaphone />, show: (m) => can(m, 'guardian:portal') },
  { href: '/estudiantes', key: 'nav.students', icon: <Users />, show: (m) => can(m, 'students:read_all') },
  { href: '/mensajes', key: 'nav.messages', icon: <MessageSquare />, show: (m) => can(m, 'comms:send', 'guardian:portal') },
  { href: '/salud-publica', key: 'nav.publicHealth', icon: <Activity />, show: (m) => can(m, 'public_health:manage') },
  { href: '/estadisticas', key: 'nav.stats', icon: <BarChart3 />, show: (m) => can(m, 'stats:clinical', 'stats:anonymous') },
  { href: '/admin', key: 'nav.admin', icon: <Settings />, show: (m) => can(m, 'admin:users', 'admin:settings', 'audit:read', 'compliance:manage') },
  { href: '/estudiante', key: 'nav.myPass', icon: <QrCode />, show: (m) => can(m, 'student:portal') },
  { href: '/perfil', key: 'nav.profile', icon: <User />, show: () => true },
];

interface NotificationItem {
  id: string;
  subject: string | null;
  body: string;
  link: string | null;
  urgent: boolean;
  readAt: string | null;
  createdAt: string;
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const items = useMemo(() => NAV.filter((n) => n.show(me)), [me]);
  const clinical = can(me, 'clinical:read');
  const kiosk = me.kiosk;

  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: NotificationItem[]; unread: number }>('/notifications', { query: { limit: 20 } }), refetchInterval: 60_000 });
  useLive(['notification'], [['notifications']], (_, p) => {
    const fn = p.urgent ? toast.warning : toast;
    fn(String(p.subject ?? 'Nueva notificación'), { action: p.link ? { label: 'Ver', onClick: () => router.push(String(p.link)) } : undefined });
  });

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const refreshQueue = () => offlineQueue.list().then((l) => setQueued(l.length)).catch(() => undefined);
    update();
    refreshQueue();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('sgee:queue', refreshQueue);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('sgee:queue', refreshQueue);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (me.locale && LOCALES.includes(me.locale as Locale) && !localStorage.getItem('sgee:locale')) setLocale(me.locale as Locale);
  }, [me.locale, setLocale]);

  const active = (href: string) => pathname === href || (href !== '/familia' && href !== '/enfermeria' && pathname.startsWith(`${href}/`)) || (href === '/enfermeria' && pathname === '/enfermeria');

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Navegación principal">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors [&_svg]:h-5 [&_svg]:w-5', active(n.href) ? 'bg-primary-700 text-white dark:bg-primary-500 dark:text-[#06201e]' : 'text-fg/80 hover:bg-card-muted')}
          aria-current={active(n.href) ? 'page' : undefined}
        >
          {n.icon}
          {t(n.key)}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {!kiosk && (
        <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card px-3 py-4 lg:flex">
          <Link href={me.home} className="mb-6 flex items-center gap-2.5 px-2">
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">MediSchool</span>
              <span className="block truncate text-xs text-muted">{me.tenant.name}</span>
            </span>
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-card-muted p-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800 dark:bg-primary-900 dark:text-primary-100">
              {me.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.name}</span>
              <span className="block truncate text-xs text-muted">{me.email}</span>
            </span>
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label={t('action.logout')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/85 px-3 backdrop-blur sm:px-5">
          {!kiosk && (
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
              <Menu className="h-5 w-5" />
            </Button>
          )}
          {kiosk && (
            <span className="flex items-center gap-2 font-semibold">
              <img src="/icon.svg" alt="" className="h-8 w-8" /> Portería · {me.tenant.name}
            </span>
          )}
          {!kiosk && can(me, 'students:read') && (
            <button onClick={() => setPaletteOpen(true)} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm text-muted hover:border-primary-400 sm:max-w-md">
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('action.search')}</span>
              <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {clinical && (
              <Button variant="danger" onClick={() => setEmergencyOpen(true)} className="animate-pulse-ring font-bold tracking-wide">
                <Siren className="h-5 w-5" /> <span className="hidden sm:inline">{t('action.emergency')}</span>
              </Button>
            )}
            <Popover
              trigger={
                <Button variant="ghost" size="icon" aria-label={`Notificaciones (${notifications.data?.unread ?? 0} sin leer)`} className="relative">
                  <Bell className="h-5 w-5" />
                  {!!notifications.data?.unread && <span className="tabular absolute right-1.5 top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{Math.min(99, notifications.data.unread)}</span>}
                </Button>
              }
              className="w-[min(92vw,380px)]"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="font-semibold">Notificaciones</p>
                <button className="text-xs text-primary-700 hover:underline dark:text-primary-300" onClick={() => api('/notifications/read-all', { method: 'POST' }).then(() => notifications.refetch())}>
                  Marcar todas como leídas
                </button>
              </div>
              <ul className="max-h-96 overflow-y-auto">
                {notifications.data?.items.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">Sin notificaciones</li>}
                {notifications.data?.items.map((n) => (
                  <li key={n.id}>
                    <button
                      className={cn('flex w-full flex-col gap-0.5 rounded-xl px-2 py-2 text-left hover:bg-card-muted', !n.readAt && 'bg-primary-50/60 dark:bg-primary-950/30')}
                      onClick={() => {
                        api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() => notifications.refetch());
                        if (n.link) router.push(n.link);
                      }}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {n.urgent && <Badge tone="danger">Urgente</Badge>}
                        {n.subject}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted">{n.body}</span>
                      <span className="text-[11px] text-muted">{relative(n.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('theme.toggle')}>
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Popover
              trigger={
                <Button variant="ghost" size="icon" aria-label="Menú de usuario">
                  <User className="h-5 w-5" />
                </Button>
              }
              className="w-72"
            >
              <div className="flex flex-col gap-2 p-2">
                <div>
                  <p className="font-semibold">{me.name}</p>
                  <p className="text-xs text-muted">{me.email}</p>
                  <p className="mt-1 text-xs text-muted">{me.tenant.name}</p>
                </div>
                <label className="text-xs font-medium text-muted" htmlFor="lang">
                  Idioma
                </label>
                <Select id="lang" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_LABELS[l]}
                    </option>
                  ))}
                </Select>
                <Link href="/perfil" className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-card-muted">
                  <ShieldCheck className="h-4 w-4" /> Seguridad y preferencias
                </Link>
                <button onClick={logout} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-red-600 hover:bg-card-muted">
                  <LogOut className="h-4 w-4" /> {t('action.logout')}
                </button>
              </div>
            </Popover>
          </div>
        </header>

        {(!online || queued > 0) && (
          <div className={cn('no-print flex items-center gap-2 px-4 py-2 text-sm', online ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'bg-slate-800 text-white')} role="status">
            <WifiOff className="h-4 w-4" />
            {!online ? t('state.offline') : null}
            {queued > 0 && (
              <span className="ml-auto">
                {queued} {t('state.queued')}
              </span>
            )}
          </div>
        )}

        <main id="contenido" className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 pb-24 sm:px-6 lg:pb-8">
          {children}
        </main>

        {!kiosk && (
          <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegación rápida">
            {items.slice(0, 3).map((n) => (
              <Link key={n.href} href={n.href} className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] [&_svg]:h-5 [&_svg]:w-5', active(n.href) ? 'text-primary-700 dark:text-primary-300' : 'text-muted')}>
                {n.icon}
                <span className="max-w-full truncate px-1">{t(n.key)}</span>
              </Link>
            ))}
            <button onClick={() => setMobileOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
              <Menu className="h-5 w-5" /> Más
            </button>
          </nav>
        )}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card p-3 shadow-2xl">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="flex items-center gap-2 font-semibold">
                <img src="/icon.svg" alt="" className="h-8 w-8" /> MediSchool
              </span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            <Button variant="outline" onClick={logout} className="mt-3">
              <LogOut className="h-4 w-4" /> {t('action.logout')}
            </Button>
          </div>
        </div>
      )}

      {paletteOpen && <CommandPalette me={me} items={items} onClose={() => setPaletteOpen(false)} onEmergency={() => setEmergencyOpen(true)} />}
      {clinical && <EmergencyDialog open={emergencyOpen} onOpenChange={setEmergencyOpen} />}
    </div>
  );
}

function CommandPalette({ me, items, onClose, onEmergency }: { me: Me; items: NavItem[]; onClose: () => void; onEmergency: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 200);
  const students = useQuery({ queryKey: ['students', 'palette', dq], queryFn: () => api<{ items: StudentRow[] }>('/students', { query: { q: dq, limit: 8 } }), enabled: dq.length >= 2 });
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const studentHref = (s: StudentRow) => (can(me, 'clinical:read', 'students:read_all') ? `/estudiantes/${s.id}` : hasRole(me, 'TEACHER') ? `/docente?student=${s.id}` : `/estudiantes/${s.id}`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Buscar" size="md">
      <Command shouldFilter={false} className="flex flex-col gap-2" label="Paleta de comandos">
        <Command.Input value={q} onValueChange={setQ} autoFocus placeholder={t('action.search')} className="h-12 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-primary-500" />
        <Command.List className="max-h-[60vh] overflow-y-auto">
          {students.data?.items.length ? (
            <Command.Group heading="Estudiantes" className="text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {students.data.items.map((s) => (
                <Command.Item key={s.id} value={s.id} onSelect={() => go(studentHref(s))} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-fg data-[selected=true]:bg-card-muted">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted">
                    {s.code} · {s.group?.name}
                  </span>
                  {s.alerts?.anaphylaxis && <Badge tone="solidDanger">Anafilaxia</Badge>}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading="Ir a" className="text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {can(me, 'clinical:read') && (
              <Command.Item onSelect={() => { onClose(); onEmergency(); }} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-red-600 data-[selected=true]:bg-card-muted">
                <Siren className="h-4 w-4" /> {t('action.emergency')}
              </Command.Item>
            )}
            {items
              .filter((n) => !q || t(n.key).toLowerCase().includes(q.toLowerCase()))
              .map((n) => (
                <Command.Item key={n.href} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm text-fg data-[selected=true]:bg-card-muted [&_svg]:h-4 [&_svg]:w-4">
                  {n.icon} {t(n.key)}
                </Command.Item>
              ))}
            {can(me, 'encounters:write') && (
              <Command.Item onSelect={() => go('/enfermeria?nueva=1')} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm text-fg data-[selected=true]:bg-card-muted">
                <ClipboardList className="h-4 w-4" /> Nueva atención
              </Command.Item>
            )}
          </Command.Group>
        </Command.List>
      </Command>
    </Dialog>
  );
}
