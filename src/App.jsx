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
//   Pestañas: Inicio | Historial | Rutinas | Progreso

import { useState, useEffect } from 'react'
import { supabase }    from './lib/supabase'
import LoginPage    from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage     from './pages/HomePage'
import WorkoutPage  from './pages/WorkoutPage'
import HistoryPage  from './pages/HistoryPage'
import RoutinesPage from './pages/RoutinesPage'
import ProgressPage from './pages/ProgressPage'

export default function App() {
  // null = cargando, objeto = sesión activa, false = sin sesión
  const [session, setSession] = useState(null)
  const [authView, setAuthView] = useState('login')  // 'login' | 'register'

  const [page, setPage]               = useState('home')
  const [routineId, setRoutineId]     = useState(null)
  const [routineName, setRoutineName] = useState('')

  useEffect(() => {
    // Recuperar sesión existente al montar (persiste en localStorage automáticamente)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? false)
    })

    // Escuchar cambios de sesión: login, logout, refresco de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? false)
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
    { id: 'home',     label: 'Inicio'    },
    { id: 'history',  label: 'Historial' },
    { id: 'routines', label: 'Rutinas'   },
    { id: 'progress', label: 'Progreso'  },
  ]

  // La barra de navegación se oculta durante un entrenamiento activo
  const showNav = page !== 'workout'

  return (
    <div className="min-h-screen bg-gray-50">
      {showNav && (
        <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
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

          {/* Spacer + botón cerrar sesión alineado a la derecha */}
          <div className="flex-1" />
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-400 hover:text-black transition-colors"
            aria-label="Cerrar sesión"
          >
            Salir
          </button>
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
      </main>
    </div>
  )
}
