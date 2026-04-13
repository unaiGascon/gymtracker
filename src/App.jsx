// Componente raíz — gestiona sesión de usuario y navegación entre pantallas
//
// Flujo de autenticación:
//   - Al montar: recupera la sesión activa de Supabase (persiste en localStorage)
//   - onAuthStateChange: detecta login/logout en tiempo real
//   - Sin sesión → LoginPage o RegisterPage
//   - Con sesión → app normal con barra de navegación + botón cerrar sesión
//
// Flujo de pantallas:
//   HomePage → WorkoutPage → (fin) → HistoryPage
//   Pestañas: Inicio | Historial | Rutinas | Progreso | Conexiones | Perfil
//
// Ruta especial: /connect?token=TOKEN → AcceptConnectionPage
//   (pública, sin necesidad de sesión previa)
//
// Recuperación de entrenamiento activo:
//   Si el navegador recargó con un entrenamiento en curso, WorkoutPage guarda
//   activeRoutineId y activeRoutineName en localStorage. Al inicializar, App
//   lee esos valores y arranca directamente en la pantalla de entrenamiento.

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

export default function App() {
  // Detectar si la URL es /connect?token=... antes de cualquier otra lógica.
  // Si es así, mostramos AcceptConnectionPage independientemente de la sesión.
  const connectToken = new URLSearchParams(window.location.search).get('token')

  // null = cargando, objeto = sesión activa, false = sin sesión
  const [session, setSession] = useState(null)
  const [authView, setAuthView] = useState('login')  // 'login' | 'register'

  // Inicialización lazy: si había un entrenamiento activo al recargar,
  // arrancamos directamente en WorkoutPage en lugar de HomePage.
  const [page, setPage]               = useState(() =>
    localStorage.getItem('activeRoutineId') ? 'workout' : 'home'
  )
  const [routineId, setRoutineId]     = useState(() =>
    localStorage.getItem('activeRoutineId') || null
  )
  const [routineName, setRoutineName] = useState(() =>
    localStorage.getItem('activeRoutineName') || ''
  )

  useEffect(() => {
    // Recuperar sesión existente al montar (persiste en localStorage automáticamente)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? false)
    })

    // Escuchar cambios de sesión: login, logout, refresco de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? false)

      // Si se acaba de iniciar sesión, comprobar si hay un token de conexión pendiente
      // (guardado en localStorage antes de redirigir al login con Google OAuth)
      if (session) {
        const pending = localStorage.getItem('pendingConnectionToken')
        if (pending) {
          localStorage.removeItem('pendingConnectionToken')
          // Redirigir a /connect?token=... para completar la conexión
          window.location.href = `/connect?token=${pending}`
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    // onAuthStateChange setea session a false automáticamente
  }

  // Llamado desde HomePage al elegir una rutina
  function goToWorkout(id, name) {
    setRoutineId(id)
    setRoutineName(name)
    setPage('workout')
  }

  // ── Ruta pública /connect?token=... ──
  // Mostramos AcceptConnectionPage sin esperar sesión (ella gestiona su propio auth)
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

  // ── Sin sesión: mostrar login o registro ──
  if (session === false) {
    if (authView === 'register') {
      return <RegisterPage onGoToLogin={() => setAuthView('login')} />
    }
    return <LoginPage onGoToRegister={() => setAuthView('register')} />
  }

  // ── Con sesión: app normal ──
  const user = session.user

  const NAV_TABS = [
    { id: 'home',        label: 'Inicio'     },
    { id: 'history',     label: 'Historial'  },
    { id: 'routines',    label: 'Rutinas'    },
    { id: 'progress',    label: 'Progreso'   },
    { id: 'connections', label: 'Conexiones' },
    { id: 'profile',     label: 'Perfil'     },
  ]

  // La barra de navegación se oculta durante un entrenamiento activo
  const showNav = page !== 'workout'

  return (
    <div className="min-h-screen bg-gray-50">
      {showNav && (
        <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 overflow-x-auto">
          {NAV_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setPage(tab.id)}
              className={`font-medium px-3 py-1 rounded text-sm ${
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

      <main className="max-w-2xl mx-auto">
        {page === 'home' && (
          <HomePage user={user} onSelectRoutine={goToWorkout} />
        )}

        {page === 'workout' && (
          <WorkoutPage
            user={user}
            routineId={routineId}
            routineName={routineName}
            onBack={() => setPage('home')}
            onFinish={() => setPage('history')}
          />
        )}

        {page === 'history' && (
          <HistoryPage user={user} onBack={() => setPage('home')} />
        )}

        {page === 'routines' && (
          <RoutinesPage user={user} />
        )}

        {page === 'progress' && (
          <ProgressPage user={user} />
        )}

        {page === 'connections' && (
          <ConnectionsPage user={user} />
        )}

        {page === 'profile' && (
          <ProfilePage user={user} onSignOut={handleSignOut} />
        )}
      </main>
    </div>
  )
}
