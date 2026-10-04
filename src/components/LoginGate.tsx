import { createContext } from 'preact'
import { useContext, useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Redirect } from 'wouter'
import { canBrowseAsGuest, isCloudSyncConfigured } from '../services/cloudSyncService'
import { syncSeed } from '../services/dataService'
import {
  authErrorMessage, isAuthConfigured, refreshUser, registerWithEmail, resendVerification,
  sendPasswordReset, signInWithEmail, signInWithGoogle, signOutUser, subscribeToAuth, type AuthUser
} from '../services/authService'
import { Button } from './Button'
import { BrandMark } from './BrandMark'

/** Sant när appen körs utan konto: passen sparas bara på enheten (beslut 2026-10-03). */
export const GuestContext = createContext(false)

export function useIsGuest(): boolean {
  return useContext(GuestContext)
}

/**
 * Med moln går appen att använda utan konto (gäst), passen stannar då på enheten och
 * följer med in i kontot vid inloggning. Ligger ett kontos data på enheten krävs
 * inloggning som förut (canBrowseAsGuest). Workern kräver en bekräftad e-postadress,
 * eftersom D1-datan ligger under adressen. Utan moln (lokal utveckling) finns ingen grind.
 */
export function useAuthUser(): AuthUser | null | undefined {
  const [user, setUser] = useState<AuthUser | null | undefined>(isCloudSyncConfigured() ? undefined : null)
  useEffect(() => {
    if (!isCloudSyncConfigured() || !isAuthConfigured()) return
    return subscribeToAuth(setUser)
  }, [])
  return user
}

export function LoginGate({ children }: { children: ComponentChildren }) {
  const user = useAuthUser()
  // Snapshoten hämtas först när Firebase gett en bekräftad användare, med giltig token.
  // Körs om per användare, så ett kontobyte hämtar det nya kontots data.
  const uid = user && user.emailVerified ? user.uid : null
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    syncSeed()
      .catch(err => console.error('Molnsnapshoten kunde inte hämtas:', err))
      .finally(() => { if (!cancelled) setLoadedFor(uid) })
    return () => { cancelled = true }
  }, [uid])
  // Utloggad: gäst om enheten är tom eller gästens, annars inloggning som förut
  const [guest, setGuest] = useState<boolean | null>(null)
  useEffect(() => {
    if (user !== null || !isCloudSyncConfigured()) return
    let cancelled = false
    canBrowseAsGuest()
      .then(ok => { if (!cancelled) setGuest(ok) })
      .catch(() => { if (!cancelled) setGuest(false) })
    return () => { cancelled = true }
  }, [user])

  if (!isCloudSyncConfigured()) return <>{children}</>
  if (!isAuthConfigured()) return <Shell><p class="login-error">Inloggningen är inte konfigurerad i det här bygget.</p></Shell>
  if (user === undefined || (user === null && guest === null)) return <Shell><p class="login-subtitle">Laddar…</p></Shell>
  if (user === null && guest) return <GuestContext.Provider value={true}>{children}</GuestContext.Provider>
  if (user === null) return <Shell><LoginForm /></Shell>
  if (!user.emailVerified) return <Shell><VerifyEmail user={user} /></Shell>
  // Misslyckas hämtningen släpps appen in ändå: synkfelet visas beständigt av CloudSyncStatus
  if (loadedFor !== user.uid) return <Shell><p class="login-subtitle">Hämtar dina pass…</p></Shell>
  return <>{children}</>
}

function Shell({ children }: { children: ComponentChildren }) {
  return (
    <main class="login-gate-container">
      <div class="login-gate-form">
        <BrandMark class="login-brand-mark" />
        <h1 class="login-gate-title">Beefcake</h1>
        <p class="login-subtitle">Träningslogg</p>
        {children}
      </div>
    </main>
  )
}

/** /konto: inloggning för en gäst. Inloggad (eller utan moln) finns inget att göra här. */
export function AccountPage() {
  if (!useIsGuest()) return <Redirect to="/" />
  return (
    <div class="account-page">
      <h1 class="page-title">Konto</h1>
      <div class="login-gate-form account-login">
        <p class="mb">Med ett konto sparas passen i molnet och följer med mellan dina enheter. Det du redan loggat följer med in i kontot.</p>
        <LoginForm initialMode="register" />
      </div>
    </div>
  )
}

const GUEST_SAVED_EVENT = 'beefcake-guest-saved'

/** Anropas efter varje pass en gäst sparar: rutan i GuestSaveBanner visas igen. */
export function announceGuestSave(): void {
  window.dispatchEvent(new Event(GUEST_SAVED_EVENT))
}

export function GuestSaveBanner() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const show = () => setShown(true)
    window.addEventListener(GUEST_SAVED_EVENT, show)
    return () => window.removeEventListener(GUEST_SAVED_EVENT, show)
  }, [])
  if (!shown) return null
  return (
    <div class="update-banner guest-banner" role="status">
      <span><strong>Passet är sparat, men bara på den här enheten.</strong> Rensas webbläsarens data eller byter du telefon är passen borta. Skapa ett konto så sparas de i molnet, även de du redan loggat.</span>
      <div class="flex gap-sm">
        <Button size="sm" href="/konto">Skapa konto</Button>
        <Button size="sm" variant="secondary" onClick={() => setShown(false)}>Inte nu</Button>
      </div>
    </div>
  )
}

type Mode = 'login' | 'register' | 'reset'

function LoginForm({ initialMode = 'login' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await action()
      if (done) setInfo(done)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: Event) {
    e.preventDefault()
    const address = email.trim()
    if (!address || (mode !== 'reset' && !password)) {
      setError(mode === 'reset' ? 'Ange din e-postadress.' : 'Ange e-postadress och lösenord.')
      return
    }
    if (mode === 'reset') return void run(() => sendPasswordReset(address), 'Ett mejl med återställningslänk är skickat.')
    if (mode === 'register') return void run(() => registerWithEmail(address, password))
    void run(() => signInWithEmail(address, password))
  }

  return (
    <form onSubmit={submit}>
      {/* Googles egen knappform (branding-riktlinjerna), inte appens Button: användare känner igen den. */}
      <button type="button" class="gsi mb" disabled={busy} onClick={() => run(signInWithGoogle)}>
        <svg class="gsi-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
        Logga in med Google
      </button>
      <p class="login-subtitle">eller med e-post</p>
      <input
        type="email"
        class="login-input"
        value={email}
        placeholder="E-post"
        autocomplete="email"
        aria-label="E-post"
        onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
      />
      {mode !== 'reset' && (
        <input
          type="password"
          class="login-input"
          value={password}
          placeholder="Lösenord"
          autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
          aria-label="Lösenord"
          onInput={(e: Event) => setPassword((e.target as HTMLInputElement).value)}
        />
      )}
      {error && <p class="login-error" role="alert">{error}</p>}
      {info && <p class="login-subtitle" role="status">{info}</p>}
      <Button type="submit" class="btn-block" disabled={busy}>
        {mode === 'register' ? 'Skapa konto' : mode === 'reset' ? 'Skicka återställningslänk' : 'Logga in'}
      </Button>
      <div class="login-links">
        {mode !== 'login' && <button type="button" class="link-button" onClick={() => setMode('login')}>Logga in</button>}
        {mode !== 'register' && <button type="button" class="link-button" onClick={() => setMode('register')}>Skapa konto</button>}
        {mode !== 'reset' && <button type="button" class="link-button" onClick={() => setMode('reset')}>Glömt lösenordet</button>}
      </div>
    </form>
  )
}

// Obekräftad adress har aldrig läst D1, så det lokala är gästens: utloggningen behåller det
function VerifyEmail({ user }: { user: AuthUser }) {
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setError(null)
    try {
      const fresh = await refreshUser()
      if (!fresh?.emailVerified) setInfo('Adressen är inte bekräftad än. Klicka på länken i mejlet först.')
      else window.location.reload()
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <div>
      <p>Bekräfta <strong>{user.email}</strong> via länken i mejlet från Firebase, sedan är det bara att träna.</p>
      {info && <p class="login-subtitle" role="status">{info}</p>}
      {error && <p class="login-error" role="alert">{error}</p>}
      <Button class="btn-block mb" onClick={check}>Jag har bekräftat</Button>
      <div class="login-links">
        <button type="button" class="link-button" onClick={() => resendVerification().then(() => setInfo('Nytt mejl skickat.')).catch(err => setError(authErrorMessage(err)))}>Skicka mejlet igen</button>
        <button type="button" class="link-button" onClick={() => void signOutUser()}>Logga ut</button>
      </div>
    </div>
  )
}
