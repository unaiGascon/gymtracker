// Pantalla de progreso por ejercicio
//
// Vistas internas:
//   'list'   — ejercicios que el usuario ha entrenado al menos una vez
//   'detail' — gráfica de PS + tabla sesión a sesión para un ejercicio

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

// ─────────────────────────────────────────────
// Componente raíz — gestiona la navegación interna
// ─────────────────────────────────────────────
export default function ProgressPage({ user }) {
  const [view, setView]         = useState('list')
  const [selected, setSelected] = useState(null)  // { id, name, muscle_group }

  return (
    <div>
      {view === 'list' && (
        <ExerciseList
          onSelect={ex => { setSelected(ex); setView('detail') }}
        />
      )}
      {view === 'detail' && (
        <ExerciseProgress
          exercise={selected}
          onBack={() => setView('list')}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ExerciseList — ejercicios únicos con datos registrados
//
// Consulta log_sets filtrado por workout_logs completados para mostrar
// solo ejercicios que el usuario ha entrenado (no el catálogo completo).
// ─────────────────────────────────────────────
function ExerciseList({ onSelect }) {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { loadExercises() }, [])

  async function loadExercises() {
    // !inner filtra log_sets cuyo workout_log no existe o no está completado
    const { data } = await supabase
      .from('log_sets')
      .select('exercise_id, exercises(id, name, muscle_group), workout_logs!inner(completed)')
      .eq('workout_logs.completed', true)

    if (!data) { setLoading(false); return }

    // Deduplicar por exercise_id — solo un registro por ejercicio
    const seen   = new Set()
    const unique = []
    for (const s of data) {
      if (!seen.has(s.exercise_id) && s.exercises) {
        seen.add(s.exercise_id)
        unique.push(s.exercises)
      }
    }

    unique.sort((a, b) => a.name.localeCompare(b.name))
    setExercises(unique)
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando ejercicios...</div>
  }

  if (exercises.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        Aún no tienes entrenamientos registrados.
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-1">Progreso</h1>
      <p className="text-sm text-gray-400 mb-5">Elige un ejercicio para ver su evolución</p>

      <div className="flex flex-col gap-2">
        {exercises.map(ex => (
          <button
            key={ex.id}
            onClick={() => onSelect(ex)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-400 transition-colors flex items-center gap-2"
          >
            <span className="font-medium text-sm">{ex.name}</span>
            {ex.muscle_group && (
              <span className="text-xs text-gray-400">{ex.muscle_group}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ExerciseProgress — gráfica de PS + tabla sesión a sesión
//
// Props:
//   exercise — { id, name, muscle_group }
//   onBack   — volver a la lista
//
// Performance Score (PS) por sesión:
//   peso_max         = máximo weight_done de esa sesión
//   mejor_serie_reps = reps_done de la serie con mayor weight_done
//   volumen_total    = Σ(reps_done × weight_done) de todas las series
//   PS = (peso_max × mejor_serie_reps) + (volumen_total × 0.1)
// ─────────────────────────────────────────────
function ExerciseProgress({ exercise, onBack }) {
  const [sessions, setSessions] = useState([])  // [{ date, dateLabel, pesoMax, volumen, ps }]
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadProgress(exercise.id) }, [exercise.id])

  async function loadProgress(exerciseId) {
    const { data } = await supabase
      .from('log_sets')
      .select('reps_done, weight_done, log_id, workout_logs!inner(logged_date, completed)')
      .eq('exercise_id', exerciseId)
      .eq('workout_logs.completed', true)

    if (!data) { setLoading(false); return }

    // Agrupar las series por sesión (log_id)
    const sessionMap = {}
    for (const s of data) {
      if (!sessionMap[s.log_id]) {
        sessionMap[s.log_id] = {
          date: s.workout_logs.logged_date,
          sets: [],
        }
      }
      sessionMap[s.log_id].sets.push(s)
    }

    // Calcular métricas y PS para cada sesión
    const result = Object.values(sessionMap)
      .map(({ date, sets }) => {
        // Ignorar series sin datos numéricos o con peso cero
        const valid = sets.filter(s =>
          s.reps_done != null && s.weight_done != null && s.weight_done > 0
        )
        if (valid.length === 0) return null

        const pesoMax    = Math.max(...valid.map(s => s.weight_done))
        // Reps de la serie con mayor peso (si hay empate, la primera)
        const mejorSerie = valid.reduce((best, s) =>
          s.weight_done > best.weight_done ? s : best
        )
        const volumen = valid.reduce((sum, s) => sum + s.reps_done * s.weight_done, 0)
        const ps      = (pesoMax * mejorSerie.reps_done) + (volumen * 0.1)

        return {
          date,
          dateLabel: formatDate(date),
          pesoMax,
          volumen:   Math.round(volumen),
          ps:        Math.round(ps * 10) / 10,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date))  // orden cronológico

    setSessions(result)
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando progreso...</div>
  }

  return (
    <div className="p-4 pb-12">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-black text-lg leading-none"
          aria-label="Volver"
        >←</button>
        <div>
          <h1 className="text-lg font-bold leading-tight">{exercise.name}</h1>
          {exercise.muscle_group && (
            <p className="text-xs text-gray-400">{exercise.muscle_group}</p>
          )}
        </div>
      </div>

      {sessions.length < 2 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          {sessions.length === 0
            ? 'Sin datos registrados para este ejercicio.'
            : 'Se necesitan al menos 2 sesiones para mostrar la gráfica.'}
        </p>
      ) : (
        <>
          {/* ── Gráfica de Performance Score ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
              Performance Score
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={sessions} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="ps"
                  stroke="#111827"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#111827', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#111827' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabla sesión a sesión (más reciente primero) ── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Cabecera de la tabla */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-2.5 border-b border-gray-100">
              <span>Fecha</span>
              <span className="text-right">Peso máx</span>
              <span className="text-right pl-4">Volumen</span>
              <span className="text-right pl-4">PS</span>
            </div>
            {[...sessions].reverse().map((s, i) => (
              <div
                key={s.date + i}
                className="grid grid-cols-[1fr_auto_auto_auto] text-sm px-4 py-2.5 border-b border-gray-50 last:border-0"
              >
                <span className="text-gray-700">{s.dateLabel}</span>
                <span className="text-right text-gray-500">{s.pesoMax} kg</span>
                <span className="text-right text-gray-500 pl-4">{s.volumen} kg</span>
                <span className="text-right font-medium pl-4">{s.ps}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ChartTooltip — tooltip personalizado de la gráfica
// Recharts lo renderiza al pasar el cursor sobre un punto
// ─────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-gray-700 mb-0.5">{label}</p>
      <p className="text-gray-900">PS: <span className="font-bold">{payload[0].value}</span></p>
    </div>
  )
}

// ─────────────────────────────────────────────
// formatDate — convierte '2024-01-15' en '15 ene'
// Parsea la fecha como local para evitar desfase de zona horaria
// ─────────────────────────────────────────────
function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-').map(Number)
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${day} ${months[month - 1]}`
}
