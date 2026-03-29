// Pantalla "Historial"
// Lista todas las sesiones guardadas ordenadas por fecha.
// Al hacer clic en una sesión se muestra el detalle con todas las series.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
export default function HistoryPage({ onBack }) {
  const [sessions, setSessions]       = useState([])   // workout_logs con nombre de rutina
  const [selectedId, setSelectedId]   = useState(null) // id del log abierto en detalle
  const [loading, setLoading]         = useState(true)

  useEffect(() => { loadSessions() }, [])

  // Carga todos los workout_logs con el nombre de la rutina y el número de ejercicios
  async function loadSessions() {
    setLoading(true)

    // Traemos el log con la rutina anidada y los log_sets para contar ejercicios únicos
    const { data } = await supabase
      .from('workout_logs')
      .select('id, logged_date, notes, routines(name), log_sets(exercise_id)')
      .order('logged_date', { ascending: false })

    if (data) {
      // Añadir el conteo de ejercicios únicos a cada sesión
      const sessions = data.map(log => ({
        ...log,
        exerciseCount: new Set(log.log_sets.map(s => s.exercise_id)).size,
      }))
      setSessions(sessions)
    }

    setLoading(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando historial...</div>
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        Aún no hay entrenamientos registrados.
      </div>
    )
  }

  // Si hay una sesión seleccionada, mostrar su detalle
  if (selectedId) {
    return (
      <SessionDetail
        logId={selectedId}
        session={sessions.find(s => s.id === selectedId)}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  // ── Lista de sesiones ──
  return (
    <div className="p-4">
      {/* Cabecera con botón para volver al inicio */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-black text-lg leading-none"
          aria-label="Volver al inicio"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">Historial</h1>
      </div>

      <div className="flex flex-col gap-2">
        {sessions.map(session => (
          <button
            key={session.id}
            onClick={() => setSelectedId(session.id)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              {/* Fecha formateada */}
              <span className="font-semibold text-sm">
                {formatDate(session.logged_date)}
              </span>
              {/* Número de ejercicios */}
              <span className="text-xs text-gray-400">
                {session.exerciseCount} ejercicio{session.exerciseCount !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Nombre de la rutina */}
            <span className="text-sm text-gray-500">{session.routines?.name ?? '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SessionDetail: detalle de una sesión con todas las series
// ─────────────────────────────────────────────
function SessionDetail({ logId, session, onBack }) {
  // sets agrupados por ejercicio: { exerciseName: [{set_number, reps_done, weight_done}] }
  const [setsByExercise, setSetsByExercise] = useState({})
  const [exerciseOrder, setExerciseOrder]   = useState([])   // para mantener el orden de aparición
  const [loading, setLoading]               = useState(true)

  useEffect(() => { loadDetail() }, [logId])

  async function loadDetail() {
    setLoading(true)

    // log_sets con el nombre del ejercicio anidado, ordenados por ejercicio y número de serie
    const { data } = await supabase
      .from('log_sets')
      .select('set_number, reps_done, weight_done, exercises(name, muscle_group)')
      .eq('log_id', logId)
      .order('set_number')

    if (data) {
      // Agrupar series por nombre de ejercicio manteniendo el orden de aparición
      const grouped  = {}
      const order    = []
      for (const s of data) {
        const name = s.exercises?.name ?? 'Desconocido'
        if (!grouped[name]) {
          grouped[name] = { muscle_group: s.exercises?.muscle_group, sets: [] }
          order.push(name)
        }
        grouped[name].sets.push(s)
      }
      setSetsByExercise(grouped)
      setExerciseOrder(order)
    }

    setLoading(false)
  }

  return (
    <div className="p-4">
      {/* Cabecera con botón atrás */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-black text-lg leading-none"
          aria-label="Volver al historial"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-bold leading-tight">
            {formatDate(session?.logged_date)}
          </h1>
          <p className="text-sm text-gray-500">{session?.routines?.name ?? '—'}</p>
        </div>
      </div>

      {loading && <div className="text-center text-gray-400 py-8">Cargando...</div>}

      {!loading && exerciseOrder.length === 0 && (
        <p className="text-gray-400 text-sm">No se registraron series en esta sesión.</p>
      )}

      {/* Un bloque por ejercicio */}
      {!loading && exerciseOrder.map(name => {
        const { muscle_group, sets } = setsByExercise[name]
        return (
          <div key={name} className="mb-4">
            {/* Nombre y músculo */}
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="font-semibold text-sm">{name}</span>
              {muscle_group && (
                <span className="text-xs text-gray-400">{muscle_group}</span>
              )}
            </div>

            {/* Cabecera de columnas */}
            <div className="grid grid-cols-[1.5rem_1fr_1fr] gap-2 text-xs text-gray-400 mb-1">
              <span className="text-center">#</span>
              <span className="text-center">Reps</span>
              <span className="text-center">Peso kg</span>
            </div>

            {/* Filas de series */}
            {sets.map(s => (
              <div
                key={s.set_number}
                className="grid grid-cols-[1.5rem_1fr_1fr] gap-2 items-center mb-1"
              >
                <span className="text-xs text-gray-400 text-center">{s.set_number}</span>
                <span className="text-sm text-center border border-gray-100 rounded-lg py-1 bg-gray-50">
                  {s.reps_done ?? '—'}
                </span>
                <span className="text-sm text-center border border-gray-100 rounded-lg py-1 bg-gray-50">
                  {s.weight_done ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Utilidad: formatea "2025-01-15" → "mié 15 ene"
// ─────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—'
  // Parsear como fecha local (sin zona horaria) para evitar desfase de un día
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
