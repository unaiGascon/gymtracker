// Pantalla de inicio
// Carga las rutinas propias del usuario y las asignadas por su entrenador.
//
// Lógica de "Hoy":
//   - Busca el último workout_log del usuario
//   - La siguiente rutina en el ciclo (por campo "order") es la del día
//   - Las rutinas asignadas por el entrenador no participan en el ciclo

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage({ user, onSelectRoutine }) {
  const [routines, setRoutines]         = useState([])  // rutinas propias ordenadas por "order"
  const [assignedRoutines, setAssigned] = useState([])  // rutinas asignadas por el entrenador
  const [todayId, setTodayId]           = useState(null)
  const [loading, setLoading]           = useState(true)

  // Rutina activa guardada en localStorage (entrenamiento en curso no finalizado)
  const activeId   = localStorage.getItem('activeRoutineId')
  const activeName = localStorage.getItem('activeRoutineName') || 'Entrenamiento en curso'

  useEffect(() => {
    async function loadData() {
      // 1. Rutinas propias (user_id = usuario actual, sin is_template)
      const { data: own } = await supabase
        .from('routines')
        .select('id, name, notes, order')
        .eq('user_id', user.id)
        .neq('is_template', true)
        .is('assigned_to', null)
        .order('order')

      // 2. Rutinas asignadas por el entrenador (assigned_to = usuario actual)
      const { data: assigned, error: assignedError } = await supabase
        .from('routines')
        .select('id, name, notes, order')
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false })

      if (assignedError) console.error('Error cargando rutinas asignadas:', assignedError)
      console.log('Rutinas asignadas:', assigned)
      setAssigned(assigned || [])

      if (!own?.length) {
        setLoading(false)
        return
      }

      setRoutines(own)

      // 3. Último workout_log para calcular la rutina del día
      const { data: lastLog } = await supabase
        .from('workout_logs')
        .select('routine_id')
        .eq('user_id', user.id)
        .order('logged_date', { ascending: false })
        .limit(1)
        .single()

      const nextRoutine = getNextRoutine(own, lastLog?.routine_id ?? null)
      setTodayId(nextRoutine.id)

      setLoading(false)
    }

    loadData()
  }, [user.id])

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando rutinas...</div>
  }

  const noContent = routines.length === 0 && assignedRoutines.length === 0

  if (noContent) {
    return (
      <div className="p-8 text-center text-gray-400">
        No hay rutinas creadas. Añade una en la pestaña Rutinas.
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Banner de entrenamiento en curso — visible si el usuario volvió atrás sin finalizar */}
      {activeId && (
        <button
          onClick={() => onSelectRoutine(activeId, activeName)}
          className="w-full flex items-center justify-between bg-gray-900 text-white rounded-xl px-5 py-4 mb-5 shadow-md"
        >
          <div className="text-left">
            <p className="text-xs font-medium text-gray-400 mb-0.5">Entrenamiento en curso</p>
            <p className="font-semibold text-base">{activeName}</p>
          </div>
          <span className="text-lg">→</span>
        </button>
      )}

      <h1 className="text-2xl font-bold mb-1">¿Qué entrenamos hoy?</h1>
      <p className="text-sm text-gray-400 mb-6">Elige una rutina para empezar</p>

      <div className="flex flex-col gap-3">
        {/* Rutinas propias del usuario */}
        {routines.map(routine => {
          const isToday = routine.id === todayId
          return (
            <button
              key={routine.id}
              onClick={() => onSelectRoutine(routine.id, routine.name)}
              className={`w-full text-left rounded-xl px-5 py-4 transition-all
                ${isToday
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white border border-gray-200 text-gray-800 hover:border-gray-400 hover:shadow-sm'
                }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-base">{routine.name}</span>
                {isToday && (
                  <span className="text-xs font-bold bg-white text-gray-900 px-2 py-0.5 rounded-full shrink-0">
                    Hoy
                  </span>
                )}
              </div>
              {routine.notes && (
                <p className="text-sm mt-0.5 text-gray-400">{routine.notes}</p>
              )}
            </button>
          )
        })}

        {/* Rutinas asignadas por el entrenador */}
        {assignedRoutines.length > 0 && (
          <>
            {routines.length > 0 && (
              <p className="text-xs text-gray-400 mt-2 mb-1 font-medium">De tu entrenador</p>
            )}
            {assignedRoutines.map(routine => (
              <button
                key={routine.id}
                onClick={() => onSelectRoutine(routine.id, routine.name)}
                className="w-full text-left rounded-xl px-5 py-4 bg-white border border-blue-100 text-gray-800 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-base">{routine.name}</span>
                  <span className="text-xs text-blue-500 font-medium shrink-0">
                    De tu entrenador
                  </span>
                </div>
                {routine.notes && (
                  <p className="text-sm mt-0.5 text-gray-400">{routine.notes}</p>
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Determina qué rutina toca a continuación en el ciclo
//
//   - Sin historial → la primera (order más bajo)
//   - Con historial → la siguiente en la lista ordenada
//   - Wrap-around al llegar al final
// ─────────────────────────────────────────────
function getNextRoutine(routines, lastRoutineId) {
  if (!lastRoutineId) return routines[0]

  const lastIndex = routines.findIndex(r => r.id === lastRoutineId)
  if (lastIndex === -1) return routines[0]

  return routines[(lastIndex + 1) % routines.length]
}
