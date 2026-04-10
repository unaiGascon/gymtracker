// Página pública para aceptar una invitación de conexión entrenador-cliente.
// Accesible en: /connect?token=TOKEN
//
// Flujos posibles:
//   - Token inválido o ya usado → mensaje de error
//   - Sin sesión → formulario inline de login o registro
//      · Email/contraseña → onAuthStateChange detecta la sesión y continúa
//      · Google OAuth → redirectTo apunta a esta misma URL, así al volver ya hay sesión
//   - Con sesión → muestra quién invita y botón "Aceptar"
//   - Tras aceptar → botón para ir a la app

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AcceptConnectionPage({ token }) {
  // null = cargando sesión, false = sin sesión, objeto = con sesión
  const [session, setSession]     = useState(null)
  const [connection, setConnection] = useState(null)  // registro de trainer_connections
  const [inviterName, setInviterName] = useState('')
  // 'loading' | 'invalid' | 'used' | 'ready' | 'accepted' | 'error'
  const [status, setStatus]       = useState('loading')
  const [authView, setAuthView]   = useState('login') // 'login' | 'register'

  // Recuperar sesión al montar y escuchar cambios (login/logout)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Verificar el token cada vez que cambia la sesión (incluye al hacer login)
  useEffect(() => {
    if (session === null) return // aún cargando sesión
    checkToken()
  }, [session])

  // Busca el token en BD y determina el estado de la invitación
  async function checkToken() {
    setStatus('loading')
    const { data, error } = await supabase
      .from('trainer_connections')
      .select('id, type, active, client_id, trainer_id')
      .eq('token', token)
      .single()

    if (error || !data) {
      setStatus('invalid')
      return
    }

    // Ya tiene los dos campos rellenos → enlace ya fue usado
    if (data.client_id && data.trainer_id) {
      setStatus('used')
      return
    }

    setConnection(data)

    // Obtener el nombre de quien generó el enlace
    const inviterId = data.type === 'client_invites_trainer'
      ? data.client_id   // el cliente creó el enlace
      : data.trainer_id  // el entrenador creó el enlace
    if (inviterId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', inviterId)
        .single()
      setInviterName(profile?.display_name || 'Alguien')
    }

    setStatus('ready')
  }

  // Rellena el campo vacío (trainer_id o client_id) con el usuario actual
  async function acceptConnection() {
    if (!session || !connection) return

    // 'client_invites_trainer' → quien acepta es el entrenador → rellenamos trainer_id
    // 'trainer_invites_client' → quien acepta es el cliente   → rellenamos client_id
    const update = connection.type === 'client_invites_trainer'
      ? { trainer_id: session.user.id, active: true }
      : { client_id:  session.user.id, active: true }

    const { error } = await supabase
      .from('trainer_connections')
      .update(update)
      .eq('id', connection.id)

    setStatus(error ? 'error' : 'accepted')
  }

  // ── Renderizado según estado ────────────────────────────────────────────────

  if (status === 'loading') {
    return <Screen><p className="text-gray-400 text-sm">Cargando...</p></Screen>
  }

  if (status === 'invalid') {
    return (
      <Screen>
        <Message icon="❌" title="Enlace no válido"
          text="Este enlace de invitación no existe o ha expirado." />
      </Screen>
    )
  }

  if (status === 'used') {
    return (
      <Screen>
        <Message icon="✅" title="Enlace ya usado"
          text="Esta invitación ya fue aceptada anteriormente." />
        <GoHomeButton />
      </Screen>
    )
  }

  if (status === 'accepted') {
    return (
      <Screen>
        <Message icon="🎉" title="¡Conectado!"
          text="La conexión se ha establecido correctamente." />
        <GoHomeButton />
      </Screen>
    )
  }

  if (status === 'error') {
    return (
      <Screen>
        <Message icon="⚠️" title="Error al aceptar"
          text="No se pudo completar la conexión. Inténtalo de nuevo." />
        <button onClick={checkToken} className="text-sm text-gray-500 underline mt-2">
          Reintentar
        </button>
      </Screen>
    )
  }

  // status === 'ready'

  // Sin sesión → formulario de login/registro inline para no perder el contexto
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <InvitationBanner connection={connection} inviterName={inviterName} />

          <p className="text-sm text-gray-500 text-center mb-4">
            Para aceptar, inicia sesión o crea una cuenta.
          </p>

          {/* Selector login / registro */}
          <div className="flex gap-2 mb-4">
            {[
              { id: 'login',    label: 'Iniciar sesión' },
              { id: 'register', label: 'Registrarse'    },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setAuthView(v.id)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg ${
                  authView === v.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {authView === 'login'
            ? <InlineLogin />
            : <InlineRegister />
          }
        </div>
      </div>
    )
  }

  // Con sesión → mostrar la invitación y botón de aceptar
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <InvitationBanner connection={connection} inviterName={inviterName} />
        <button
          onClick={acceptConnection}
          className="w-full bg-black text-white rounded-lg py-2.5 text-sm font-medium mb-3"
        >
          Aceptar conexión
        </button>
        <button
          onClick={() => { window.location.href = '/' }}
          className="w-full text-sm text-gray-400 hover:text-gray-600"
        >
          Rechazar
        </button>
      </div>
    </div>
  )
}

// ─── Componentes de layout ───────────────────────────────────────────────────

// Centra el contenido en pantalla completa
function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-4 text-center">
      {children}
    </div>
  )
}

// Icono + título + descripción
function Message({ icon, title, text }) {
  return (
    <>
      <div className="text-4xl mb-1">{icon}</div>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-gray-500">{text}</p>
    </>
  )
}

function GoHomeButton() {
  return (
    <button
      onClick={() => { window.location.href = '/' }}
      className="mt-2 bg-black text-white rounded-lg px-6 py-2.5 text-sm font-medium"
    >
      Ir a la app
    </button>
  )
}

// Tarjeta que explica la invitación según su tipo
function InvitationBanner({ connection, inviterName }) {
  if (!connection) return null
  const isTrainerInvite = connection.type === 'trainer_invites_client'
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 text-center">
      <p className="text-3xl mb-2">{isTrainerInvite ? '🏋️' : '👤'}</p>
      <p className="font-semibold text-gray-900 mb-1">
        {isTrainerInvite
          ? `${inviterName} quiere ser tu entrenador`
          : `${inviterName} te invita como su entrenador`}
      </p>
      <p className="text-sm text-gray-500">
        {isTrainerInvite
          ? 'Podrá ver tu historial de entrenamientos y progreso.'
          : 'Podrás ver su historial de entrenamientos y progreso.'}
      </p>
    </div>
  )
}

// ─── Formularios inline ──────────────────────────────────────────────────────
// No usan props de token — el redirectTo de OAuth apunta a window.location.href
// que ya incluye el ?token= para que al volver se complete la conexión.

function InlineLogin() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos.')
      setLoading(false)
    }
    // Si tiene éxito, onAuthStateChange en el componente padre detecta la sesión
  }

  async function handleGoogle() {
    // Supabase OAuth solo acepta redirect URLs exactas registradas en el dashboard,
    // así que no podemos usar window.location.href (que incluye el token dinámico).
    // Solución: guardar el token en localStorage antes del redirect; App.jsx lo
    // recupera tras el login y redirige a /connect?token=... para completar la conexión.
    const token = new URLSearchParams(window.location.search).get('token')
    if (token) localStorage.setItem('pendingConnectionToken', token)

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email" required
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
      />
      <input
        type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Contraseña" required
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={loading}
        className="bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
      <Divider />
      <button type="button" onClick={handleGoogle}
        className="border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2">
        <GoogleIcon /> Entrar con Google
      </button>
    </form>
  )
}

function InlineRegister() {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setError('Mínimo 6 caracteres.'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: name.trim() } },
    })
    if (error) { setError(error.message); setLoading(false) }
    // Si "Confirm email" está desactivado en Supabase, onAuthStateChange abre sesión sola
  }

  async function handleGoogle() {
    const token = new URLSearchParams(window.location.search).get('token')
    if (token) localStorage.setItem('pendingConnectionToken', token)

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="Nombre" required
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400" />
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email" required
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Contraseña (mín. 6 caracteres)" required
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={loading}
        className="bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
        {loading ? 'Registrando...' : 'Crear cuenta'}
      </button>
      <Divider />
      <button type="button" onClick={handleGoogle}
        className="border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2">
        <GoogleIcon /> Registrarse con Google
      </button>
    </form>
  )
}

// ─── Helpers de UI ───────────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400">o</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
