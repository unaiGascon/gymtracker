// Pantalla "Rutinas"
// Contiene dos secciones accesibles por pestañas internas:
//   - Rutinas   → lista, detalle y edición de rutinas
//   - Ejercicios → catálogo de ejercicios (crear, editar, eliminar)
//
// Navegación interna (view):
//   'routine-list'    — lista de rutinas
//   'routine-detail'  — ejercicios de una rutina concreta
//   'exercise-list'   — catálogo de ejercicios
//   'exercise-edit'   — formulario crear / editar un ejercicio

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLOCK_LABELS = {
  warmup:   'Calentamiento',
  main:     'Bloque principal',
  cardio:   'Cardio',
  cooldown: 'Vuelta a la calma',
}
const BLOCK_ORDER = ['warmup', 'main', 'cardio', 'cooldown']

// Grupos musculares disponibles en el catálogo
const MUSCLE_GROUPS = [
  'Pecho', 'Espalda', 'Piernas', 'Hombros',
  'Bíceps', 'Tríceps', 'Cardio', 'Movilidad', 'Flexibilidad',
]

// ─────────────────────────────────────────────
// Componente raíz — gestiona sección activa y navegación interna
// ─────────────────────────────────────────────
export default function RoutinesPage() {
  const [view, setView]               = useState('routine-list')
  const [selectedRoutine, setRoutine] = useState(null)  // { id, name, order }
  const [editingExercise, setEditing] = useState(null)  // null = crear nuevo

  // Sección activa: 'routines' | 'exercises'
  const section = view.startsWith('exercise') ? 'exercises' : 'routines'

  function switchSection(s) {
    setView(s === 'exercises' ? 'exercise-list' : 'routine-list')
  }

  return (
    <div>
      {/* Pestañas internas: Rutinas / Ejercicios */}
      {/* Se ocultan cuando estamos en el detalle de una rutina para no confundir */}
      {view !== 'routine-detail' && (
        <div className="flex border-b border-gray-200 bg-white px-4 pt-4 gap-4">
          {['routines', 'exercises'].map(s => (
            <button
              key={s}
              onClick={() => switchSection(s)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                section === s
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {s === 'routines' ? 'Rutinas' : 'Ejercicios'}
            </button>
          ))}
        </div>
      )}

      {/* Contenido según la vista activa */}
      {view === 'routine-list' && (
        <RoutineList
          onSelectRoutine={r => { setRoutine(r); setView('routine-detail') }}
        />
      )}

      {view === 'routine-detail' && (
        <RoutineDetail
          routine={selectedRoutine}
          onBack={() => setView('routine-list')}
        />
      )}

      {view === 'exercise-list' && (
        <ExerciseList
          onEdit={ex => { setEditing(ex); setView('exercise-edit') }}
          onCreate={() => { setEditing(null); setView('exercise-edit') }}
        />
      )}

      {view === 'exercise-edit' && (
        <ExerciseForm
          exercise={editingExercise}
          onBack={() => setView('exercise-list')}
          onSaved={() => setView('exercise-list')}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// RoutineList — lista de rutinas + formulario para crear nueva
// ─────────────────────────────────────────────
function RoutineList({ onSelectRoutine }) {
  const [routines, setRoutines] = useState([])
  const [loading, setLoading]   = useState(true)
  const [newName, setNewName]   = useState('')
  const [newOrder, setNewOrder] = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => { loadRoutines() }, [])

  async function loadRoutines() {
    const { data } = await supabase
      .from('routines')
      .select('id, name, order')
      .order('order')
    setRoutines(data || [])
    setLoading(false)
  }

  async function createRoutine(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    await supabase.from('routines').insert({
      name:  newName.trim(),
      order: newOrder !== '' ? parseInt(newOrder) : null,
    })
    setNewName('')
    setNewOrder('')
    setSaving(false)
    loadRoutines()
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando rutinas...</div>
  }

  return (
    <div className="p-4">
      {routines.length === 0 && (
        <p className="text-sm text-gray-400 mb-6">Aún no hay rutinas. Crea la primera abajo.</p>
      )}

      <div className="flex flex-col gap-2 mb-8">
        {routines.map(r => (
          <button
            key={r.id}
            onClick={() => onSelectRoutine(r)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-400 transition-colors flex items-center justify-between"
          >
            <span className="font-medium text-sm">{r.name}</span>
            <span className="text-xs text-gray-400">#{r.order ?? '—'}</span>
          </button>
        ))}
      </div>

      <div className="border border-gray-200 rounded-xl p-4 bg-white">
        <h2 className="font-semibold text-sm mb-3">Nueva rutina</h2>
        <form onSubmit={createRoutine} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nombre</label>
            <input
              type="text"
              placeholder="Ej: Día de piernas"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Orden en el ciclo</label>
            <input
              type="number"
              placeholder="Ej: 1"
              value={newOrder}
              onChange={e => setNewOrder(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              min="1"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Crear rutina'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// RoutineDetail — ejercicios de una rutina + añadir / eliminar /
//                 reordenar / superseries
// ─────────────────────────────────────────────
function RoutineDetail({ routine, onBack }) {
  const [exercises, setExercises] = useState([])
  const [catalog, setCatalog]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm] = useState({
    exercise_id: '', block: 'main', sets: '', reps: '', weight_kg: '', duration_min: '',
  })
  const [muscleFilter, setMuscleFilter] = useState('')  // filtra el select de ejercicios
  const [adding, setAdding]     = useState(false)
  const [deleting, setDeleting] = useState(null)   // id del routine_exercise borrándose
  const [moving, setMoving]     = useState(null)   // id del ejercicio moviéndose (↑↓)
  const [toggling, setToggling] = useState(null)   // "id1-id2" del par de superserie procesándose

  useEffect(() => {
    loadExercises()
    loadCatalog()
  }, [])

  async function loadExercises() {
    const { data } = await supabase
      .from('routine_exercises')
      .select('*, exercises(name, muscle_group)')
      .eq('routine_id', routine.id)
      .order('order')
    setExercises(data || [])
    setLoading(false)
  }

  async function loadCatalog() {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, muscle_group')
      .order('name')
    setCatalog(data || [])
  }

  async function addExercise(e) {
    e.preventDefault()
    if (!form.exercise_id) return
    setAdding(true)
    const nextOrder = exercises.length > 0
      ? Math.max(...exercises.map(ex => ex.order ?? 0)) + 1 : 1
    await supabase.from('routine_exercises').insert({
      routine_id:   routine.id,
      exercise_id:  form.exercise_id,
      block:        form.block,
      order:        nextOrder,
      sets:         form.sets         !== '' ? parseInt(form.sets)         : null,
      reps:         form.reps         !== '' ? parseInt(form.reps)         : null,
      weight_kg:    form.weight_kg    !== '' ? parseFloat(form.weight_kg)  : null,
      duration_min: form.duration_min !== '' ? parseInt(form.duration_min) : null,
    })
    setForm(f => ({ ...f, exercise_id: '', sets: '', reps: '', weight_kg: '', duration_min: '' }))
    setAdding(false)
    loadExercises()
  }

  async function removeExercise(reId) {
    setDeleting(reId)
    await supabase.from('routine_exercises').delete().eq('id', reId)
    setDeleting(null)
    loadExercises()
  }

  // Intercambia el campo "order" de dos ejercicios consecutivos dentro del mismo bloque.
  // direction: -1 = mover arriba, +1 = mover abajo
  // blockExercises: el array ya ordenado del bloque actual (para encontrar al vecino)
  async function moveExercise(re, direction, blockExercises) {
    const idx = blockExercises.findIndex(e => e.id === re.id)
    const neighbor = blockExercises[idx + direction]
    if (!neighbor) return
    setMoving(re.id)
    // Intercambiar los valores de "order" entre los dos ejercicios
    await Promise.all([
      supabase.from('routine_exercises').update({ order: neighbor.order }).eq('id', re.id),
      supabase.from('routine_exercises').update({ order: re.order }).eq('id', neighbor.id),
    ])
    setMoving(null)
    loadExercises()
  }

  // Une o separa dos ejercicios consecutivos como superserie.
  // Si ya comparten superset_group → los separa (pone null en ambos).
  // Si no → les asigna el mismo grupo nuevo (ss_<timestamp>).
  async function toggleSuperset(reA, reB) {
    const key = `${reA.id}-${reB.id}`
    setToggling(key)
    const alreadyJoined = reA.superset_group && reA.superset_group === reB.superset_group
    if (alreadyJoined) {
      await Promise.all([
        supabase.from('routine_exercises').update({ superset_group: null }).eq('id', reA.id),
        supabase.from('routine_exercises').update({ superset_group: null }).eq('id', reB.id),
      ])
    } else {
      const group = `ss_${Date.now()}`
      await Promise.all([
        supabase.from('routine_exercises').update({ superset_group: group }).eq('id', reA.id),
        supabase.from('routine_exercises').update({ superset_group: group }).eq('id', reB.id),
      ])
    }
    setToggling(null)
    loadExercises()
  }

  // Ejercicios del catálogo filtrados por grupo muscular seleccionado
  const filteredCatalog = muscleFilter
    ? catalog.filter(ex => ex.muscle_group === muscleFilter)
    : catalog

  const isTimedBlock = form.block === 'cardio'

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando...</div>
  }

  // Agrupar ejercicios por bloque (ya vienen ordenados por "order" desde la query)
  const byBlock = {}
  for (const re of exercises) {
    if (!byBlock[re.block]) byBlock[re.block] = []
    byBlock[re.block].push(re)
  }

  return (
    <div className="p-4 pb-12">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-black text-lg leading-none" aria-label="Volver">←</button>
        <div>
          <h1 className="text-lg font-bold leading-tight">{routine.name}</h1>
          <p className="text-xs text-gray-400">Orden #{routine.order ?? '—'} en el ciclo</p>
        </div>
      </div>

      {exercises.length === 0 && (
        <p className="text-sm text-gray-400 mb-6">Esta rutina no tiene ejercicios aún.</p>
      )}

      {BLOCK_ORDER.filter(b => byBlock[b]).map(block => {
        const blockExercises = byBlock[block]
        return (
          <div key={block} className="mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
              {BLOCK_LABELS[block]}
            </p>

            {blockExercises.map((re, idx) => {
              const next = blockExercises[idx + 1]
              const isInSuperset = !!re.superset_group
              const isJoinedWithNext = next && re.superset_group && re.superset_group === next.superset_group
              const toggleKey = next ? `${re.id}-${next.id}` : null
              const isToggling = toggleKey && toggling === toggleKey
              const isMoving   = moving === re.id

              return (
                <div key={re.id}>
                  {/* ── Fila del ejercicio ── */}
                  <div className={`flex items-center bg-white border border-gray-200 rounded-lg
                    ${isInSuperset ? 'border-l-4 border-l-purple-500' : ''}
                    ${idx < blockExercises.length - 1 ? 'mb-0 rounded-b-none border-b-0' : ''}`}
                  >
                    {/* Botones ↑ / ↓ */}
                    <div className="flex flex-col border-r border-gray-100 px-1.5 py-1 gap-0.5 shrink-0">
                      <button
                        onClick={() => moveExercise(re, -1, blockExercises)}
                        disabled={idx === 0 || isMoving}
                        className="text-gray-300 hover:text-gray-700 disabled:opacity-0 text-xs leading-none px-1"
                        aria-label="Mover arriba"
                      >↑</button>
                      <button
                        onClick={() => moveExercise(re, +1, blockExercises)}
                        disabled={idx === blockExercises.length - 1 || isMoving}
                        className="text-gray-300 hover:text-gray-700 disabled:opacity-0 text-xs leading-none px-1"
                        aria-label="Mover abajo"
                      >↓</button>
                    </div>

                    {/* Nombre, músculo y configuración */}
                    <div className="flex-1 px-3 py-2.5">
                      <span className="text-sm font-medium">{re.exercises?.name}</span>
                      {re.exercises?.muscle_group && (
                        <span className="text-xs text-gray-400 ml-2">{re.exercises.muscle_group}</span>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {re.duration_min
                          ? `${re.duration_min} min`
                          : [re.sets && `${re.sets} series`, re.reps && `${re.reps} reps`, re.weight_kg && `${re.weight_kg} kg`]
                              .filter(Boolean).join(' · ') || '—'
                        }
                      </p>
                    </div>

                    {/* Botón eliminar */}
                    <button
                      onClick={() => removeExercise(re.id)}
                      disabled={deleting === re.id}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none px-3 disabled:opacity-30"
                      aria-label="Eliminar ejercicio"
                    >×</button>
                  </div>

                  {/* ── Botón "Unir / Separar superserie" entre ejercicios consecutivos ── */}
                  {next && (
                    <button
                      onClick={() => toggleSuperset(re, next)}
                      disabled={!!isToggling}
                      className={`w-full text-xs py-1 border-x border-gray-200 transition-colors disabled:opacity-40
                        ${isJoinedWithNext
                          ? 'bg-purple-50 text-purple-600 hover:bg-purple-100 border-l-4 border-l-purple-500'
                          : 'bg-gray-50 text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                      {isJoinedWithNext ? 'Separar superserie' : '+ Unir como superserie'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* ── Formulario: añadir ejercicio ── */}
      <div className="border border-gray-200 rounded-xl p-4 bg-white mt-4">
        <h2 className="font-semibold text-sm mb-3">Añadir ejercicio</h2>
        <form onSubmit={addExercise} className="flex flex-col gap-3">

          {/* Bloque */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Bloque</label>
            <select
              value={form.block}
              onChange={e => setForm(f => ({ ...f, block: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-gray-400"
            >
              {BLOCK_ORDER.map(b => <option key={b} value={b}>{BLOCK_LABELS[b]}</option>)}
            </select>
          </div>

          {/* Filtro por grupo muscular — limpia el ejercicio seleccionado al cambiar */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Filtrar por músculo</label>
            <select
              value={muscleFilter}
              onChange={e => { setMuscleFilter(e.target.value); setForm(f => ({ ...f, exercise_id: '' })) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">— Todos —</option>
              {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Select de ejercicio, filtrado por grupo muscular */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Ejercicio</label>
            <select
              value={form.exercise_id}
              onChange={e => setForm(f => ({ ...f, exercise_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-gray-400"
              required
            >
              <option value="">— Elige un ejercicio —</option>
              {filteredCatalog.map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}{ex.muscle_group ? ` (${ex.muscle_group})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Campos según tipo: por tiempo o por series */}
          {isTimedBlock ? (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Duración (min)</label>
              <input
                type="number" placeholder="Ej: 20" value={form.duration_min} min="1"
                onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Series',  field: 'sets',      placeholder: '4' },
                { label: 'Reps',    field: 'reps',      placeholder: '10' },
                { label: 'Peso kg', field: 'weight_kg', placeholder: '60' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  <input
                    type="number" placeholder={placeholder} value={form[field]} min="0" step={field === 'weight_kg' ? '0.5' : '1'}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
              ))}
            </div>
          )}

          <button type="submit" disabled={adding} className="bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
            {adding ? 'Añadiendo...' : 'Añadir ejercicio'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ExerciseList — catálogo de ejercicios con editar y eliminar
// ─────────────────────────────────────────────
function ExerciseList({ onEdit, onCreate }) {
  const [exercises, setExercises]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [deleting, setDeleting]     = useState(null)   // id del ejercicio borrándose
  const [confirmId, setConfirmId]   = useState(null)   // id pendiente de confirmar borrado

  useEffect(() => { loadExercises() }, [])

  async function loadExercises() {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, description')
      .order('name')
    setExercises(data || [])
    setLoading(false)
  }

  // Primer clic → pide confirmación; segundo clic → borra
  async function handleDelete(id) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setDeleting(id)
    setConfirmId(null)
    await supabase.from('exercises').delete().eq('id', id)
    setDeleting(null)
    loadExercises()
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando ejercicios...</div>
  }

  return (
    <div className="p-4">
      {/* Botón crear nuevo ejercicio */}
      <button
        onClick={onCreate}
        className="w-full bg-black text-white rounded-xl py-2.5 text-sm font-medium mb-4"
      >
        + Nuevo ejercicio
      </button>

      {exercises.length === 0 && (
        <p className="text-sm text-gray-400">El catálogo está vacío. Crea el primer ejercicio.</p>
      )}

      <div className="flex flex-col gap-2">
        {exercises.map(ex => (
          <div
            key={ex.id}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              {/* Nombre y grupo muscular */}
              <div className="min-w-0">
                <p className="font-medium text-sm">{ex.name}</p>
                {ex.muscle_group && (
                  <p className="text-xs text-gray-400">{ex.muscle_group}</p>
                )}
                {ex.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{ex.description}</p>
                )}
              </div>

              {/* Acciones: editar y eliminar */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onEdit(ex)}
                  className="text-xs text-gray-400 hover:text-black transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(ex.id)}
                  disabled={deleting === ex.id}
                  className={`text-xs transition-colors disabled:opacity-30 ${
                    confirmId === ex.id
                      ? 'text-red-500 font-semibold'
                      : 'text-gray-300 hover:text-red-500'
                  }`}
                >
                  {confirmId === ex.id ? '¿Eliminar?' : '×'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ExerciseForm — crear o editar un ejercicio del catálogo
// Props:
//   exercise — null para crear nuevo, objeto para editar
//   onBack   — volver sin guardar
//   onSaved  — volver tras guardar
// ─────────────────────────────────────────────
function ExerciseForm({ exercise, onBack, onSaved }) {
  const isEditing = !!exercise

  const [form, setForm] = useState({
    name:         exercise?.name         ?? '',
    muscle_group: exercise?.muscle_group ?? '',
    description:  exercise?.description  ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)

    const payload = {
      name:         form.name.trim(),
      muscle_group: form.muscle_group || null,
      description:  form.description.trim() || null,
    }

    if (isEditing) {
      await supabase.from('exercises').update(payload).eq('id', exercise.id)
    } else {
      await supabase.from('exercises').insert(payload)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="p-4">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-black text-lg leading-none" aria-label="Volver">←</button>
        <h1 className="text-lg font-bold">{isEditing ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Nombre */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Nombre</label>
          <input
            type="text"
            placeholder="Ej: Press banca"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
            required
          />
        </div>

        {/* Grupo muscular — select con opciones predefinidas + entrada libre */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Grupo muscular</label>
          <select
            value={form.muscle_group}
            onChange={e => setForm(f => ({ ...f, muscle_group: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— Sin especificar —</option>
            {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Descripción */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Descripción (opcional)</label>
          <textarea
            placeholder="Notas técnicas, variantes..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear ejercicio'}
        </button>
      </form>
    </div>
  )
}
