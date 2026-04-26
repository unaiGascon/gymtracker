// Componente raíz — gestiona sesión de usuario y navegación entre pantallas
//
// Flujo de autenticación:
//   - Al montar: recupera la sesión activa de Supabase
//   - onAuthStateChange: detecta login/logout en tiempo real
//   - Sin sesión → LoginPage o RegisterPage
//   - Con sesión → carga is_trainer del perfil → renderiza la navegación correcta
//
// Dos modos de navegación completamente separados según is_trainer:
//
//   MODO CLIENTE (is_trainer = false):
//     Inicio | Historial | Rutinas | Progreso | Actividad | Perfil
//
//   MODO ENTRENADOR (is_trainer = true):
//     Mis clientes | Plantillas | Conexiones | Perfil
//
// Al cambiar el toggle is_trainer en ProfilePage, la app hace window.location.reload()
// para cargar la navegación correcta desde cero.
//
// Ruta especial: /connect?token=TOKEN → AcceptConnectionPage (pública)
//
// Recuperación de entrenamiento activo:
//   Si hay activeRoutineId en localStorage, la app arranca directamente en WorkoutPage.

import { useState, useEffect } from 'react'
import { supabase }           from './lib/supabase'
import LoginPage              from './pages/LoginPage'
import RegisterPage           from './pages/RegisterPage'
import HomePage               from './pages/HomePage'
import WorkoutPage            from './pages/WorkoutPage'
import HistoryPage            from './pages/HistoryPage'
import RoutinesPage           from './pages/RoutinesPage'
import ProgressPage           from './pages/ProgressPage'
import ActivityPage           from './pages/ActivityPage'
import ConnectionsPage        from './pages/ConnectionsPage'
import AcceptConnectionPage   from './pages/AcceptConnectionPage'
import ProfilePage            from './pages/ProfilePage'

// ── Pestañas modo CLIENTE ─────────────────────────────────────────────────────

const CLIENT_TOP_TABS = [
  { id: 'home',     label: 'Inicio'    },
  { id: 'history',  label: 'Historial' },
  { id: 'routines', label: 'Rutinas'   },
  { id: 'progress', label: 'Progreso'  },
  { id: 'activity', label: 'Actividad' },
  { id: 'profile',  label: 'Perfil'    },
]

const CLIENT_BOTTOM_TABS = [
  { id: 'home',     label: 'Inicio',    icon: '⌂' },
  { id: 'history',  label: 'Historial', icon: '◷' },
  { id: 'routines', label: 'Rutinas',   icon: '☰' },
  { id: 'activity', label: 'Actividad', icon: '◎' },
  { id: 'profile',  label: 'Perfil',    icon: '◯' },
]

// ── Pestañas modo ENTRENADOR ──────────────────────────────────────────────────

const TRAINER_TOP_TABS = [
  { id: 'clients',     label: 'Mis clientes' },
  { id: 'templates',   label: 'Plantillas'   },
  { id: 'connections', label: 'Conexiones'   },
  { id: 'profile',     label: 'Perfil'       },
]

const TRAINER_BOTTOM_TABS = [
  { id: 'clients',     label: 'Clientes',   icon: '◎' },
  { id: 'templates',   label: 'Plantillas', icon: '☰' },
  { id: 'connections', label: 'Conexiones', icon: '⊕' },
  { id: 'profile',     label: 'Perfil',     icon: '◯' },
]

export default function App() {
  // Detectar si la URL es /connect?token=... antes de cualquier otra lógica
  const connectToken = new URLSearchParams(window.location.search).get('token')

  // null = cargando, objeto = sesión activa, false = sin sesión
  const [session, setSession]   = useState(null)
  const [authView, setAuthView] = useState('login') // 'login' | 'register'

  // null = cargando perfil, true/false = valor real
  const [isTrainer, setIsTrainer] = useState(null)

  // Inicialización lazy: arrancar en WorkoutPage si había entrenamiento en curso
  const [page, setPage]               = useState(() =>
    localStorage.getItem('activeRoutineId') ? 'workout' : 'home'
  )
  const [routineId, setRoutineId]     = useState(() =>
    localStorage.getItem('activeRoutineId') || null
  )
  const [routineName, setRoutineName] = useState(() =>
    localStorage.getItem('activeRoutineName') || ''
  )

  // Escuchar cambios de sesión
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? false)

      if (session) {
        const pending = localStorage.getItem('pendingConnectionToken')
        if (pending) {
          localStorage.removeItem('pendingConnectionToken')
          window.location.href = `/connect?token=${pending}`
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Cargar is_trainer del perfil una vez que hay sesión
  useEffect(() => {
    if (!session || session === false) return
    async function loadIsTrainer() {
      const { data } = await supabase
        .from('profiles')
        .select('is_trainer')
        .eq('id', session.user.id)
        .single()
      const trainer = data?.is_trainer ?? false
      setIsTrainer(trainer)
      // Los entrenadores arrancan siempre en 'Mis clientes', salvo que haya un entrenamiento en curso
      if (trainer) setPage(prev => prev === 'workout' ? prev : 'clients')
    }
    loadIsTrainer()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function goToWorkout(id, name) {
    setRoutineId(id)
    setRoutineName(name)
    setPage('workout')
  }

  // ── Ruta pública /connect?token=... ──
  if (connectToken && window.location.pathname === '/connect') {
    return <AcceptConnectionPage token={connectToken} />
  }

  // ── Cargando sesión ──
  if (session === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  // ── Sin sesión ──
  if (session === false) {
    if (authView === 'register') {
      return <RegisterPage onGoToLogin={() => setAuthView('login')} />
    }
    return <LoginPage onGoToRegister={() => setAuthView('register')} />
  }

  // ── Con sesión: esperar a conocer el rol ──
  if (isTrainer === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  const user    = session.user
  const showNav = page !== 'workout'

  // Seleccionar el juego de pestañas según el modo
  const topTabs    = isTrainer ? TRAINER_TOP_TABS    : CLIENT_TOP_TABS
  const bottomTabs = isTrainer ? TRAINER_BOTTOM_TABS : CLIENT_BOTTOM_TABS

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Barra SUPERIOR — solo PC (≥ 768px) ── */}
      {showNav && (
        <nav className="hidden md:flex bg-white border-b border-gray-200 px-4 py-3 items-center gap-2 overflow-x-auto">
          {topTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setPage(tab.id)}
              className={`font-medium px-3 py-1 rounded text-sm whitespace-nowrap ${
                page === tab.id
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
        </nav>
      )}

      {/* Contenido principal */}
      <main className="max-w-2xl mx-auto pb-24 md:pb-0">

        {/* ── Páginas modo CLIENTE ── */}
        {page === 'home' && (
          <HomePage user={user} onSelectRoutine={goToWorkout} />
        )}
        {page === 'workout' && (
          <WorkoutPage
            user={user}
            routineId={routineId}
            routineName={routineName}
            onBack={() => setPage(isTrainer ? 'clients' : 'home')}
            onFinish={() => setPage('history')}
          />
        )}
        {page === 'history' && (
          <HistoryPage user={user} onBack={() => setPage(isTrainer ? 'clients' : 'home')} />
        )}
        {page === 'routines' && (
          <RoutinesPage user={user} />
        )}
        {page === 'progress' && (
          <ProgressPage user={user} />
        )}
        {page === 'activity' && (
          <ActivityPage user={user} />
        )}

        {/* ── Páginas modo ENTRENADOR ── */}
        {page === 'clients' && (
          // Muestra directamente TrainerSection (lista de clientes + fichas)
          <ConnectionsPage user={user} trainerOnly={true} />
        )}
        {page === 'templates' && (
          // Abre RoutinesPage con la pestaña Plantillas preseleccionada
          <RoutinesPage user={user} defaultTab="templates" />
        )}
        {page === 'connections' && (
          // trainerOnly={isTrainer}: si el usuario es entrenador, muestra solo
          // la sección del entrenador (QR + lista de clientes) sin pestañas de rol
          <ConnectionsPage user={user} trainerOnly={isTrainer} />
        )}

        {/* ── Compartida: Perfil ── */}
        {page === 'profile' && (
          <ProfilePage user={user} onSignOut={handleSignOut} />
        )}

      </main>

      {/* ── Barra INFERIOR — solo móvil (< 768px) ── */}
      {showNav && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {bottomTabs.map(tab => {
            const isActive = page === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5"
              >
                <span className={`text-lg leading-none rounded-lg w-9 h-7 flex items-center justify-center ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-400'
                }`}>
                  {tab.icon}
                </span>
                <span className={`text-[10px] font-medium ${
                  isActive ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </nav>
      )}

    </div>
  )
}
