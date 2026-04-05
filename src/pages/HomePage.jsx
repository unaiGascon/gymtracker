// Pantalla de inicio
// Carga las rutinas y determina cuál toca hoy según el historial:
//   - Sin historial → la de order = 1
//   - Con historial → la siguiente a la última entrenada (ciclo)

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Props:
//   onSelectRoutine — callback al elegir una rutina
//   (user_id no es necesario aquí — RLS filtra por usuario autenticado automáticamente)
export default function HomePage({ onSelectRoutine }) {
  const [routines, setRoutines]   = useState([])  // ordenadas por "order"
  const [todayId, setTodayId]     = useState(null) // id de la rutina que toca hoy
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function loadData() {
      // 1. Cargar todas las rutinas ordenadas por su campo "order"
      const { data: routinesData } = await supabase
        .from('routines')
        .select('id, name, notes, order')
        .order('order')

      if (!routinesData?.length) {
        setLoading(false)
        return
      }

      setRoutines(routinesData)

      // 2. Buscar el último workout_log para saber qué rutina se entrenó más recientemente
      const { data: lastLog } = await supabase
        .from('workout_logs')
        .select('routine_id')
        .order('logged_date', { ascending: false })
        .limit(1)
        .single()

      // 3. Calcular cuál es la siguiente rutina en el ciclo
      const nextRoutine = getNextRoutine(routinesData, lastLog?.routine_id ?? null)
      setTodayId(nextRoutine.id)

      setLoading(false)
    }

    loadData()
  }, [])

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando rutinas...</div>
  }

  if (routines.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        No hay rutinas creadas. Añade una en Supabase.
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">¿Qué entrenamos hoy?</h1>
      <p className="text-sm text-gray-400 mb-6">Elige una rutina para empezar</p>

      <div className="flex flex-col gap-3">
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
                <p className={`text-sm mt-0.5 ${isToday ? 'text-gray-400' : 'text-gray-400'}`}>
                  {routine.notes}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Determina qué rutina toca a continuación
//
// Lógica de ciclo:
//   - Sin historial (lastRoutineId = null) → la primera (order más bajo)
//   - Con historial → la siguiente en la lista ordenada
//   - Si la última fue la de mayor order → vuelve a la primera
// ─────────────────────────────────────────────
function getNextRoutine(routines, lastRoutineId) {
  if (!lastRoutineId) return routines[0]

  const lastIndex = routines.findIndex(r => r.id === lastRoutineId)

  // Si la última rutina no está en la lista (fue eliminada), volver a la primera
  if (lastIndex === -1) return routines[0]

  // Índice siguiente con wrap-around al llegar al final
  const nextIndex = (lastIndex + 1) % routines.length
  return routines[nextIndex]
}
