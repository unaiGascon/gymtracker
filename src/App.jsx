// Componente raíz — gestiona la navegación entre pantallas
//
// Flujo principal: HomePage → WorkoutPage → (fin) → HistoryPage
// Pestaña extra:   RoutinesPage (gestión de rutinas y ejercicios)
//
// Estado de navegación:
//   page        — pantalla activa: 'home' | 'workout' | 'history' | 'routines'
//   routineId   — id de la rutina elegida en HomePage (solo durante workout)
//   routineName — nombre para mostrarlo en WorkoutPage

import { useState } from 'react'
import HomePage     from './pages/HomePage'
import WorkoutPage  from './pages/WorkoutPage'
import HistoryPage  from './pages/HistoryPage'
import RoutinesPage from './pages/RoutinesPage'
import ProgressPage from './pages/ProgressPage'

export default function App() {
  const [page, setPage]               = useState('home')
  const [routineId, setRoutineId]     = useState(null)
  const [routineName, setRoutineName] = useState('')

  // Llamado desde HomePage al elegir una rutina
  function goToWorkout(id, name) {
    setRoutineId(id)
    setRoutineName(name)
    setPage('workout')
  }

  // Las páginas con pestaña en la nav (workout no tiene pestaña — se entra desde home)
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
        <nav className="bg-white border-b border-gray-200 px-4 py-3 flex gap-2">
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
        </nav>
      )}

      <main className="max-w-2xl mx-auto">
        {page === 'home' && (
          <HomePage onSelectRoutine={goToWorkout} />
        )}

        {page === 'workout' && (
          <WorkoutPage
            routineId={routineId}
            routineName={routineName}
            onBack={() => setPage('home')}
            onFinish={() => setPage('history')}
          />
        )}

        {page === 'history' && (
          <HistoryPage onBack={() => setPage('home')} />
        )}

        {page === 'routines' && (
          <RoutinesPage />
        )}

        {page === 'progress' && (
          <ProgressPage />
        )}
      </main>
    </div>
  )
}
