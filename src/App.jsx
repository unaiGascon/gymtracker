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
import ConnectionsPage        from './pages/ConnectionsPage'
import AcceptConnectionPage   from './pages/AcceptConnectionPage'
import ProfilePage            from './pages/ProfilePage'
import NotesPage              from './pages/NotesPage'

// ── Pestañas modo CLIENTE — 4 tabs principales ───────────────────────────────
//
//   Inicio   → HomePage
//   Rutinas  → RoutinesPage  (sub-tabs: Mis rutinas | Ejercicios | Historial)
//   Progreso → ProgressPage  (sub-tabs: Progreso | Actividad)
//   Perfil   → ProfilePage   (sub-tabs: Mi perfil | Conexiones)

const CLIENT_TOP_TABS = [
  { id: 'home',     label: 'Inicio'   },
  { id: 'routines', label: 'Rutinas'  },
  { id: 'progress', label: 'Progreso' },
  { id: 'profile',  label: 'Perfil'   },
]

const CLIENT_BOTTOM_TABS = [
  { id: 'home',     label: 'Inicio',   icon: '⌂' },
  { id: 'routines', label: 'Rutinas',  icon: '☰' },
  { id: 'progress', label: 'Progreso', icon: '↑' },
  { id: 'profile',  label: 'Perfil',   icon: '◯' },
]

// ── Pestañas modo ENTRENADOR — 3 tabs principales ────────────────────────────
//
//   Mis clientes → ConnectionsPage (trainerOnly)
//   Plantillas   → RoutinesPage    (defaultTab='templates')
//   Perfil       → ProfilePage     (sub-tabs: Mi perfil | Conexiones)

const TRAINER_TOP_TABS = [
  { id: 'clients',   label: 'Mis clientes' },
  { id: 'templates', label: 'Plantillas'   },
  { id: 'profile',   label: 'Perfil'       },
]

const TRAINER_BOTTOM_TABS = [
  { id: 'clients',   label: 'Clientes',   icon: '◎' },
  { id: 'templates', label: 'Plantillas', icon: '☰' },
  { id: 'profile',   label: 'Perfil',     icon: '◯' },
]

export default function App() {
  // Detectar si la URL es /connect?token=... antes de cualquier otra lógica
  const connectToken = new URLSearchParams(window.location.search).get('token')

  // null = cargando, objeto = sesión activa, false = sin sesión
  const [session, setSession]   = useState(null)
  const [authView, setAuthView] = useState('login') // 'login' | 'register'

  // null = cargando perfil, true/false = valor real
  const [isTrainer, setIsTrainer] = useState(null)

  const [hasNewNotes, setHasNewNotes] = useState(false)

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
      if (trainer) {
        setPage(prev => prev === 'workout' ? prev : 'clients')
      } else {
        checkNewNotes(session.user.id)
      }
    }
    loadIsTrainer()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkNewNotes(userId) {
    const lastVisited = localStorage.getItem('notesLastVisited')
    let query = supabase
      .from('trainer_notes')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', userId)
      .eq('is_private', false)
    if (lastVisited) query = query.gt('created_at', lastVisited)
    const { count } = await query
    setHasNewNotes((count ?? 0) > 0)
  }

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
          <HomePage
            user={user}
            onSelectRoutine={goToWorkout}
            hasNewNotes={hasNewNotes}
            onGoToNotes={() => setPage('notes')}
          />
        )}
        {page === 'workout' && (
          <WorkoutPage
            user={user}
            routineId={routineId}
            routineName={routineName}
            onBack={() => setPage(isTrainer ? 'clients' : 'home')}
            onFinish={() => setPage('routines')}
          />
        )}
        {/* 'history' solo se muestra como fallback (URL directa, etc.) */}
        {page === 'history' && (
          <HistoryPage user={user} onBack={() => setPage('home')} />
        )}
        {page === 'routines' && (
          <RoutinesPage user={user} />
        )}
        {page === 'progress' && (
          <ProgressPage user={user} />
        )}

        {/* ── Páginas modo ENTRENADOR ── */}
        {page === 'clients' && (
          <ConnectionsPage user={user} trainerOnly={true} />
        )}
        {page === 'templates' && (
          <RoutinesPage user={user} defaultTab="templates" />
        )}

        {/* ── Notas del entrenador — accesible solo desde el banner de Inicio ── */}
        {page === 'notes' && (
          <NotesPage user={user} onVisit={() => setHasNewNotes(false)} />
        )}

        {/* ── Compartida: Perfil (incluye Conexiones como sub-pestaña) ── */}
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
