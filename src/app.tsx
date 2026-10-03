/// <reference types="vite-plugin-pwa/client" />

import { Router, Link, Switch, Route, useLocation } from 'wouter'
import { lazy, Suspense } from 'preact/compat'
import { AccountPage, GuestSaveBanner, LoginGate, useIsGuest } from './components/LoginGate'
import { CloudSyncStatus } from './components/CloudSyncStatus'
import { UpdateBanner } from './components/UpdateBanner'
import { BeefcakeBadge, BeefcakeAvatar, useBeefcakeStreak } from './components/BeefcakeBadge'
import { Card } from './components/Card'
import { Home } from './pages/Home'
import { LogSession } from './pages/LogSession'
import { Templates } from './pages/Templates'
import { Settings } from './pages/Settings'
import { History } from './pages/History'
import { SessionDetail } from './pages/SessionDetail'
import { ExerciseDetail } from './pages/ExerciseDetail'
import { ExerciseDatabase } from './pages/ExerciseDatabase'
import { icon } from './icons'
import type { BeefcakeStreak } from './lib/streak'
import './app.css'

const Stats = lazy(async () => {
  const m = await import('./pages/Stats')
  return { default: m.Stats }
})

const navItems = [
  { href: '/', label: 'Hem', icon: 'home-icon' },
  { href: '/log', label: 'Logga pass', icon: 'log-icon' },
  { href: '/templates', label: 'Program', icon: 'template-icon' },
  { href: '/ovningar', label: 'Övningar', icon: 'barbell-icon' },
  { href: '/history', label: 'Historik', icon: 'history-icon' },
  { href: '/stats', label: 'Statistik', icon: 'stats-icon' },
  { href: '/settings', label: 'Inställningar', icon: 'settings-icon' },
]
// Sidebar och rail visar allt utom Inställningar, som ligger i sidfoten
const MAIN_NAV = navItems.slice(0, -1)
const SETTINGS_NAV = navItems[navItems.length - 1]

function NavLink({ href, label, icon: iconId, showLabel = true }: { href: string; label: string; icon: string; showLabel?: boolean }) {
  const [location] = useLocation()
  const isActive = location === href || (href !== '/' && location.startsWith(href))
  return (
    <Link href={href} class={isActive ? 'nav-link active' : 'nav-link'}>
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24">
        <use href={icon(iconId)} />
      </svg>
      {showLabel && <span class="nav-text">{label}</span>}
    </Link>
  )
}

// Märket på Hem länkar till sidan du redan står på: då är toppen det man vill åt
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function SidebarNav({ avatar }: { avatar: BeefcakeStreak | null }) {
  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <Link href="/" class="brand-link" aria-label="Beefcake, till Hem" onClick={scrollToTop}>
          {avatar && <BeefcakeAvatar streak={avatar} />}
          <span class="sidebar-wordmark">Beefcake</span>
        </Link>
      </div>
      <nav class="sidebar-nav">
        {MAIN_NAV.map(item => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} showLabel />
        ))}
      </nav>
      <div class="sidebar-footer">
        {useIsGuest() && <Link href="/konto" class="nav-link guest-login-link">Logga in eller skapa konto</Link>}
        <NavLink href={SETTINGS_NAV.href} label={SETTINGS_NAV.label} icon={SETTINGS_NAV.icon} showLabel />
      </div>
    </aside>
  )
}

function RailNav({ avatar }: { avatar: BeefcakeStreak | null }) {
  return (
    <aside class="rail">
      <div class="rail-header">
        <Link href="/" class="brand-link" aria-label="Beefcake, till Hem" onClick={scrollToTop}>
          {avatar ? <BeefcakeAvatar streak={avatar} /> : (
            <svg class="rail-wordmark" width="24" height="24" viewBox="0 0 24 24">
              <use href={icon('home-icon')} />
            </svg>
          )}
        </Link>
      </div>
      <nav class="rail-nav">
        {MAIN_NAV.map(item => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} showLabel={false} />
        ))}
      </nav>
      <div class="rail-footer">
        <NavLink href={SETTINGS_NAV.href} label={SETTINGS_NAV.label} icon={SETTINGS_NAV.icon} showLabel={false} />
      </div>
    </aside>
  )
}

function BottomNav() {
  // Hem, Logga pass, Program, Historik, Statistik: Övningar och Inställningar nås via headern.
  // Program flyttade hit 2026-09-30: bokmärket i headern var ingen ikon folk känner igen (UX-granskning, Jakob)
  const mobileNavItems = [navItems[0], navItems[1], navItems[2], navItems[4], navItems[5]]
  return (
    <nav class="bottom-nav">
      {mobileNavItems.map(item => (
        <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} showLabel />
      ))}
    </nav>
  )
}

function HeaderNav() {
  return (
    <div class="header-nav-right flex gap-sm">
      {useIsGuest() && <Link href="/konto" class="header-settings header-login">Logga in</Link>}
      <Link href="/ovningar" class="header-settings" aria-label="Övningar">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <use href={icon('barbell-icon')} />
        </svg>
      </Link>
      <Link href="/settings" class="header-settings" aria-label="Inställningar">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <use href={icon('settings-icon')} />
        </svg>
      </Link>
    </div>
  )
}

function Shell() {
  const [location] = useLocation()
  const streak = useBeefcakeStreak()
  // Cartman är bara för inloggade (beslut 2026-10-03): den öppna sajten visar en känd figur annars
  const guest = useIsGuest()
  // Hem har märket i full storlek, alla andra sidor får 40 px avatar i navigeringen
  const isHome = location === '/'
  const avatar = isHome || guest ? null : streak
  return (
    <div class="app">
      <SidebarNav avatar={avatar} />
      <RailNav avatar={avatar} />
      <header class="header">
        <Link href="/" class="header-brand brand-link" aria-label="Beefcake, till Hem" onClick={scrollToTop}>
          {avatar && <BeefcakeAvatar streak={avatar} />}
          <h1>Beefcake</h1>
        </Link>
        <HeaderNav />
      </header>
      <main class="main">
        <UpdateBanner />
        <CloudSyncStatus />
        <GuestSaveBanner />
        {isHome && !guest && <BeefcakeBadge streak={streak} />}
        <Switch>
            <Route path="/" component={Home} />
            <Route path="/log" component={LogSession} />
            <Route path="/templates" component={Templates} />
            <Route path="/history" component={History} />
            <Route path="/history/:id" component={SessionDetail} />
            <Route path="/exercises/:id" component={ExerciseDetail} />
            <Route path="/ovningar" component={ExerciseDatabase} />
            <Route path="/ovningar/:id" component={ExerciseDatabase} />
            <Route path="/stats" component={() => (
              <Suspense fallback={<Card class="skeleton skeleton-card"></Card>}>
                <Stats />
              </Suspense>
            )} />
          <Route path="/settings" component={Settings} />
          <Route path="/konto" component={AccountPage} />
        </Switch>
      </main>
      <BottomNav />
    </div>
  )
}

function AppContent() {
  return (
    <Router base="/beefcake">
      <Shell />
    </Router>
  )
}

export function App() {
  return (
    <LoginGate>
      <AppContent />
    </LoginGate>
  )
}
