// Pantalla de progreso — dos sub-pestañas:
//   "Progreso"  → gráfica de Performance Score por ejercicio
//   "Actividad" → pasos diarios y actividades extra (ActivityPage)

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ActivityPage from './ActivityPage'
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

// ─────────────────────────────────────────────
// Componente raíz — pestañas internas: Progreso | Actividad
// ─────────────────────────────────────────────
export default function ProgressPage({ user }) {
  const [tab, setTab]           = useState('progress') // 'progress' | 'activity'
  const [view, setView]         = useState('list')     // 'list' | 'detail' (solo en tab progress)
  const [selected, setSelected] = useState(null)

  return (
    <div>
      {/* Pestañas internas — se ocultan al entrar en el detalle de un ejercicio */}
      {view === 'list' && (
        <div className="flex border-b border-gray-200 bg-white px-4 pt-4 gap-4">
          {[
            { id: 'progress', label: 'Progreso'  },
            { id: 'activity', label: 'Actividad' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Pestaña Progreso: lista de ejercicios → gráfica de PS */}
      {tab === 'progress' && view === 'list' && (
        <ExerciseList onSelect={ex => { setSelected(ex); setView('detail') }} />
      )}
      {tab === 'progress' && view === 'detail' && (
        <ExerciseProgress exercise={selected} onBack={() => setView('list')} />
      )}

      {/* Pestaña Actividad: pasos diarios + actividades extra */}
      {tab === 'activity' && <ActivityPage user={user} />}
    </div>
  )
}


// ─────────────────────────────────────────────
// ExerciseList — ejercicios únicos con datos registrados
// ─────────────────────────────────────────────
function ExerciseList({ onSelect }) {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { loadExercises() }, [])

  async function loadExercises() {
    const { data } = await supabase
      .from('log_sets')
      .select('exercise_id, exercises(id, name, muscle_group), workout_logs!inner(completed)')
      .eq('workout_logs.completed', true)

    if (!data) { setLoading(false); return }

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
// ─────────────────────────────────────────────
function ExerciseProgress({ exercise, onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadProgress(exercise.id) }, [exercise.id])

  async function loadProgress(exerciseId) {
    const { data } = await supabase
      .from('log_sets')
      .select('reps_done, weight_done, log_id, workout_logs!inner(logged_date, completed)')
      .eq('exercise_id', exerciseId)
      .eq('workout_logs.completed', true)

    if (!data) { setLoading(false); return }

    const sessionMap = {}
    for (const s of data) {
      if (!sessionMap[s.log_id]) {
        sessionMap[s.log_id] = { date: s.workout_logs.logged_date, sets: [] }
      }
      sessionMap[s.log_id].sets.push(s)
    }

    const result = Object.values(sessionMap)
      .map(({ date, sets }) => {
        const valid = sets.filter(s =>
          s.reps_done != null && s.weight_done != null && s.weight_done > 0
        )
        if (valid.length === 0) return null

        const pesoMax    = Math.max(...valid.map(s => s.weight_done))
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
      .sort((a, b) => a.date.localeCompare(b.date))

    setSessions(result)
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando progreso...</div>
  }

  return (
    <div className="p-4 pb-12">
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

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
// ChartTooltip — tooltip de la gráfica de Performance Score
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
// formatDate — convierte 'YYYY-MM-DD' en 'D mes'
// Parsea como fecha local para evitar desfase de zona horaria
// ─────────────────────────────────────────────
function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-').map(Number)
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${day} ${months[month - 1]}`
}
