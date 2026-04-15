// Pantalla de progreso — dos pestañas internas:
//   "Ejercicios" — gráfica de Performance Score por ejercicio
//   "Actividad"  — registro diario de pasos y actividades extra

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

const ACTIVITY_TYPES = ['Running', 'Ciclismo', 'Natación', 'Senderismo', 'Otra']

// Fecha de hoy en formato YYYY-MM-DD (local, sin desfase de zona horaria)
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─────────────────────────────────────────────
// Componente raíz — dos pestañas: Ejercicios | Actividad
// ─────────────────────────────────────────────
export default function ProgressPage({ user }) {
  const [tab, setTab]       = useState('exercises') // 'exercises' | 'activity'
  const [view, setView]     = useState('list')      // 'list' | 'detail' (solo pestaña ejercicios)
  const [selected, setSelected] = useState(null)

  return (
    <div>
      {/* Pestañas principales solo visibles cuando no estamos en detalle de ejercicio */}
      {view !== 'detail' && (
        <div className="flex border-b border-gray-200 bg-white px-4 pt-4 gap-4">
          {[
            { id: 'exercises', label: 'Ejercicios' },
            { id: 'activity',  label: 'Actividad'  },
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

      {tab === 'exercises' && (
        <>
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
        </>
      )}

      {tab === 'activity' && (
        <ActivitySection user={user} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ActivitySection — pasos y actividades del día + historial
// Dos sub-pestañas: Hoy | Historial
// ─────────────────────────────────────────────
function ActivitySection({ user }) {
  const [tab, setTab] = useState('today') // 'today' | 'history'

  return (
    <div>
      <div className="flex gap-4 px-4 pt-4 pb-0 border-b border-gray-100">
        {[{ id: 'today', label: 'Hoy' }, { id: 'history', label: 'Historial' }].map(t => (
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

      {tab === 'today'   && <ActivityToday   user={user} />}
      {tab === 'history' && <ActivityHistory user={user} />}
    </div>
  )
}

// ─────────────────────────────────────────────
// ActivityToday — vista del día actual
//
// Flujo:
//   1. Carga el registro daily_activity de hoy (puede no existir aún)
//   2. Carga activity_logs vinculados a ese registro
//   3. Al guardar pasos: upsert en daily_activity (crea o actualiza)
//   4. Al añadir actividad: asegura que existe daily_activity y luego inserta activity_log
// ─────────────────────────────────────────────
function ActivityToday({ user }) {
  const [dailyActivity, setDailyActivity] = useState(null)
  const [activityLogs, setActivityLogs]   = useState([])
  const [steps, setSteps]                 = useState('')
  const [savingSteps, setSavingSteps]     = useState(false)
  const [stepsSaved, setStepsSaved]       = useState(false)
  const [showAddForm, setShowAddForm]     = useState(false)
  const [loading, setLoading]             = useState(true)

  const TODAY = todayISO()

  useEffect(() => { loadToday() }, [])

  async function loadToday() {
    const { data: da } = await supabase
      .from('daily_activity')
      .select('id, steps, notes')
      .eq('user_id', user.id)
      .eq('date', TODAY)
      .single()

    setDailyActivity(da || null)
    setSteps(da?.steps?.toString() ?? '')

    if (da) {
      const { data: logs } = await supabase
        .from('activity_logs')
        .select('id, type, duration_min, notes')
        .eq('daily_activity_id', da.id)
        .order('created_at')
      setActivityLogs(logs || [])
    }

    setLoading(false)
  }

  // Upsert de pasos: crea o actualiza el registro de hoy
  async function saveSteps() {
    if (steps === '') return
    setSavingSteps(true)
    const { data } = await supabase
      .from('daily_activity')
      .upsert(
        { user_id: user.id, date: TODAY, steps: parseInt(steps) },
        { onConflict: 'user_id,date' }
      )
      .select('id, steps, notes')
      .single()
    setDailyActivity(data)
    setSavingSteps(false)
    setStepsSaved(true)
    setTimeout(() => setStepsSaved(false), 2000)
  }

  // Si no existe daily_activity para hoy, lo crea antes de insertar un activity_log
  async function ensureDailyActivity() {
    if (dailyActivity) return dailyActivity.id
    const { data } = await supabase
      .from('daily_activity')
      .upsert(
        { user_id: user.id, date: TODAY },
        { onConflict: 'user_id,date' }
      )
      .select('id')
      .single()
    setDailyActivity(data)
    return data.id
  }

  async function addActivity(type, duration_min, notes) {
    const dailyId = await ensureDailyActivity()
    const { data } = await supabase
      .from('activity_logs')
      .insert({ daily_activity_id: dailyId, user_id: user.id, type, duration_min, notes })
      .select('id, type, duration_min, notes')
      .single()
    setActivityLogs(prev => [...prev, data])
    setShowAddForm(false)
  }

  async function deleteActivity(id) {
    await supabase.from('activity_logs').delete().eq('id', id)
    setActivityLogs(prev => prev.filter(a => a.id !== id))
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  const todayLabel = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="p-4">
      <p className="text-xs text-gray-400 mb-4 capitalize">{todayLabel}</p>

      {/* ── Pasos ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Pasos</p>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Ej: 8000"
            value={steps}
            min="0"
            onChange={e => setSteps(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            onClick={saveSteps}
            disabled={savingSteps || steps === ''}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {savingSteps ? '...' : stepsSaved ? '✓' : 'Guardar'}
          </button>
        </div>
        {dailyActivity?.steps != null && !stepsSaved && (
          <p className="text-xs text-gray-400 mt-2">
            Registrado: {dailyActivity.steps.toLocaleString()} pasos
          </p>
        )}
      </div>

      {/* ── Actividades extra ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Actividades</p>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="text-xs font-medium text-gray-500 hover:text-black transition-colors"
          >
            {showAddForm ? 'Cancelar' : '+ Añadir'}
          </button>
        </div>

        {showAddForm && (
          <AddActivityForm
            onSave={addActivity}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {activityLogs.length === 0 && !showAddForm && (
          <p className="text-sm text-gray-400">Sin actividades registradas hoy.</p>
        )}

        {activityLogs.map(a => (
          <div
            key={a.id}
            className="flex items-start justify-between py-2.5 border-t border-gray-50"
          >
            <div>
              <span className="text-sm font-medium">{a.type}</span>
              {a.duration_min && (
                <span className="text-xs text-gray-400 ml-2">{a.duration_min} min</span>
              )}
              {a.notes && <p className="text-xs text-gray-400 mt-0.5">{a.notes}</p>}
            </div>
            <button
              onClick={() => deleteActivity(a.id)}
              className="text-gray-300 hover:text-red-500 transition-colors text-sm ml-3 shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// AddActivityForm — formulario inline para añadir una actividad
// ─────────────────────────────────────────────
function AddActivityForm({ onSave, onCancel }) {
  const [type, setType]         = useState('Running')
  const [duration, setDuration] = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onSave(
      type,
      duration ? parseInt(duration) : null,
      notes.trim() || null,
    )
    // onSave cierra el formulario desde el padre; no necesitamos setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mb-3 pb-3 border-b border-gray-100">
      {/* Tipo de actividad */}
      <select
        value={type}
        onChange={e => setType(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-gray-400"
      >
        {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {/* Duración */}
      <input
        type="number"
        placeholder="Duración (min)"
        value={duration}
        min="1"
        onChange={e => setDuration(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
      />

      {/* Notas opcionales */}
      <input
        type="text"
        placeholder="Notas (opcional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
      />

      <button
        type="submit"
        disabled={saving}
        className="bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Añadir actividad'}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────
// ActivityHistory — últimos 30 días + gráfica semanal de pasos
// ─────────────────────────────────────────────
function ActivityHistory({ user }) {
  const [days, setDays]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    // Carga daily_activity con sus activity_logs anidados
    const { data } = await supabase
      .from('daily_activity')
      .select('id, date, steps, activity_logs(id, type, duration_min)')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(30)
    setDays(data || [])
    setLoading(false)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando historial...</div>

  if (days.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        Sin actividad registrada todavía.
      </div>
    )
  }

  // Datos para la gráfica: últimos 7 días con pasos, en orden cronológico
  const chartData = [...days]
    .filter(d => d.steps != null)
    .slice(0, 7)
    .reverse()
    .map(d => ({ date: formatDate(d.date), steps: d.steps }))

  return (
    <div className="p-4">
      {/* Gráfica semanal de pasos */}
      {chartData.length >= 2 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
            Pasos — últimos 7 días
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="date"
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
              <Tooltip content={<StepsTooltip />} />
              <Bar dataKey="steps" fill="#111827" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Lista de días */}
      <div className="flex flex-col gap-2">
        {days.map(d => (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{formatDate(d.date)}</span>
              {d.steps != null && (
                <span className="text-sm text-gray-500">
                  {d.steps.toLocaleString()} pasos
                </span>
              )}
            </div>
            {d.activity_logs?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {d.activity_logs.map(a => (
                  <span
                    key={a.id}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                  >
                    {a.type}{a.duration_min ? ` ${a.duration_min}min` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// StepsTooltip — tooltip de la gráfica de pasos
// ─────────────────────────────────────────────
function StepsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-gray-700 mb-0.5">{label}</p>
      <p className="text-gray-900">
        Pasos: <span className="font-bold">{payload[0].value?.toLocaleString()}</span>
      </p>
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
