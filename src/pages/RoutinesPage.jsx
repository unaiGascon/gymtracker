// Pantalla "Rutinas"
// Contiene tres secciones accesibles por pestañas internas:
//   - Rutinas    → lista, detalle y edición de rutinas propias del usuario
//   - Plantillas → rutinas plantilla del entrenador, asignables a clientes
//   - Ejercicios → catálogo de ejercicios (crear, editar, eliminar)
//
// Navegación interna (view):
//   'routine-list'     — lista de rutinas propias
//   'routine-detail'   — ejercicios de una rutina concreta
//   'template-list'    — lista de plantillas del entrenador
//   'template-detail'  — ejercicios de una plantilla (usa RoutineDetail)
//   'exercise-list'    — catálogo de ejercicios
//   'exercise-edit'    — formulario crear / editar un ejercicio

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
export default function RoutinesPage({ user }) {
  const [view, setView]               = useState('routine-list')
  const [selectedRoutine, setRoutine] = useState(null)  // { id, name, order, ... }
  const [editingExercise, setEditing] = useState(null)  // null = crear nuevo

  // Sección activa derivada de la vista actual
  const section = view.startsWith('exercise')
    ? 'exercises'
    : view.startsWith('template')
      ? 'templates'
      : 'routines'

  function switchSection(s) {
    if (s === 'exercises') setView('exercise-list')
    else if (s === 'templates') setView('template-list')
    else setView('routine-list')
  }

  // Las pestañas se ocultan cuando estamos en el detalle de una rutina o plantilla
  const showTabs = view !== 'routine-detail' && view !== 'template-detail'

  return (
    <div>
      {/* Pestañas internas: Rutinas / Plantillas / Ejercicios */}
      {showTabs && (
        <div className="flex border-b border-gray-200 bg-white px-4 pt-4 gap-4">
          {[
            { id: 'routines',   label: 'Rutinas'    },
            { id: 'templates',  label: 'Plantillas' },
            { id: 'exercises',  label: 'Ejercicios' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => switchSection(s.id)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                section === s.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Contenido según la vista activa */}
      {view === 'routine-list' && (
        <RoutineList
          user={user}
          onSelectRoutine={r => { setRoutine(r); setView('routine-detail') }}
        />
      )}

      {view === 'routine-detail' && (
        <RoutineDetail
          routine={selectedRoutine}
          onBack={() => setView('routine-list')}
        />
      )}

      {view === 'template-list' && (
        <TemplateList
          user={user}
          onSelectTemplate={r => { setRoutine(r); setView('template-detail') }}
        />
      )}

      {view === 'template-detail' && (
        <RoutineDetail
          routine={selectedRoutine}
          onBack={() => setView('template-list')}
          isTemplate
          trainerId={user.id}
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
// RoutineList — lista de rutinas + crear nueva
//
// Interacción por fila:
//   - Clic en el nombre → expande panel con "Ver ejercicios" / "Editar"
//   - "Ver ejercicios"  → navega al detalle de la rutina
//   - "Editar"          → abre formulario inline (nombre + orden)
//   - ↑ / ↓            → reordena intercambiando el campo "order" con la adyacente
//   - ×                 → eliminar con doble confirmación
// ─────────────────────────────────────────────
function RoutineList({ user, onSelectRoutine }) {
  const [routines, setRoutines]               = useState([])
  const [loading, setLoading]                 = useState(true)
  const [newName, setNewName]                 = useState('')
  const [newOrder, setNewOrder]               = useState('')
  const [saving, setSaving]                   = useState(false)
  const [expandedId, setExpandedId]           = useState(null)  // muestra "Ver ejercicios" / "Editar"
  const [editingId, setEditingId]             = useState(null)  // muestra formulario inline de edición
  const [editForm, setEditForm]               = useState({ name: '', order: '' })
  const [savingEdit, setSavingEdit]           = useState(false)
  const [moving, setMoving]                   = useState(null)  // id de rutina reordenándose
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)  // esperando segundo clic para borrar
  const [deleting, setDeleting]               = useState(null)

  async function loadRoutines() {
    const { data } = await supabase
      .from('routines')
      .select('id, name, order')
      .order('order')
    setRoutines(data || [])
    setLoading(false)
  }

  useEffect(() => { loadRoutines() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  async function createRoutine(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    await supabase.from('routines').insert({
      name:    newName.trim(),
      order:   newOrder !== '' ? parseInt(newOrder) : null,
      user_id: user.id,
    })
    setNewName('')
    setNewOrder('')
    setSaving(false)
    loadRoutines()
  }

  // Intercambia el campo "order" con la rutina adyacente en la lista
  async function moveRoutine(r, direction) {
    const idx      = routines.findIndex(x => x.id === r.id)
    const neighbor = routines[idx + direction]
    if (!neighbor) return
    setMoving(r.id)
    await Promise.all([
      supabase.from('routines').update({ order: neighbor.order }).eq('id', r.id),
      supabase.from('routines').update({ order: r.order }).eq('id', neighbor.id),
    ])
    setMoving(null)
    loadRoutines()
  }

  // Abre el formulario inline precargando los valores actuales
  function openEdit(r) {
    setEditingId(r.id)
    setExpandedId(null)
    setEditForm({ name: r.name, order: r.order ?? '' })
  }

  async function saveEdit(r) {
    if (!editForm.name.trim()) return
    setSavingEdit(true)
    await supabase.from('routines').update({
      name:  editForm.name.trim(),
      order: editForm.order !== '' ? parseInt(editForm.order) : null,
    }).eq('id', r.id)
    setSavingEdit(false)
    setEditingId(null)
    loadRoutines()
  }

  // Primer clic → pide confirmación; segundo clic → borra
  async function handleDelete(id) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setDeleting(id)
    setConfirmDeleteId(null)
    await supabase.from('routines').delete().eq('id', id)
    setDeleting(null)
    loadRoutines()
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id)
    setEditingId(null)
    setConfirmDeleteId(null)
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
        {routines.map((r, idx) => {
          const isExpanded = expandedId === r.id
          const isEditing  = editingId  === r.id
          const isMoving   = moving     === r.id

          return (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

              {/* ── Fila principal ── */}
              <div className="flex items-center">

                {/* Botones ↑ / ↓ */}
                <div className="flex flex-col border-r border-gray-100 px-1.5 py-1 gap-0.5 shrink-0">
                  <button
                    onClick={() => moveRoutine(r, -1)}
                    disabled={idx === 0 || isMoving}
                    className="text-gray-300 hover:text-gray-700 disabled:opacity-0 text-xs leading-none px-1"
                    aria-label="Subir rutina"
                  >↑</button>
                  <button
                    onClick={() => moveRoutine(r, +1)}
                    disabled={idx === routines.length - 1 || isMoving}
                    className="text-gray-300 hover:text-gray-700 disabled:opacity-0 text-xs leading-none px-1"
                    aria-label="Bajar rutina"
                  >↓</button>
                </div>

                {/* Nombre + orden — clic para expandir el panel de acciones */}
                <button
                  onClick={() => toggleExpand(r.id)}
                  className="flex-1 text-left px-3 py-3 flex items-center justify-between"
                >
                  <span className="font-medium text-sm">{r.name}</span>
                  <span className="text-xs text-gray-400 ml-2">#{r.order ?? '—'}</span>
                </button>

                {/* Eliminar con doble confirmación */}
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deleting === r.id}
                  className={`text-xs px-3 py-3 transition-colors disabled:opacity-30 ${
                    confirmDeleteId === r.id
                      ? 'text-red-500 font-semibold'
                      : 'text-gray-300 hover:text-red-500'
                  }`}
                >
                  {confirmDeleteId === r.id ? '¿Eliminar?' : '×'}
                </button>
              </div>

              {/* ── Panel de acciones (al expandir) ── */}
              {isExpanded && (
                <div className="flex border-t border-gray-100">
                  <button
                    onClick={() => onSelectRoutine(r)}
                    className="flex-1 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-r border-gray-100"
                  >
                    Ver ejercicios
                  </button>
                  <button
                    onClick={() => openEdit(r)}
                    className="flex-1 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Editar
                  </button>
                </div>
              )}

              {/* ── Formulario inline de edición de nombre y orden ── */}
              {isEditing && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-xs text-gray-500 block mb-1">Orden</label>
                      <input
                        type="number" min="1"
                        value={editForm.order}
                        onChange={e => setEditForm(f => ({ ...f, order: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(r)}
                      disabled={savingEdit}
                      className="flex-1 bg-gray-900 text-white text-sm font-medium py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {savingEdit ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 border border-gray-300 text-gray-600 text-sm font-medium py-1.5 rounded-lg"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Formulario nueva rutina ── */}
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
// TemplateList — lista de plantillas del entrenador + crear nueva
//
// Una plantilla es una rutina con is_template = true.
// El entrenador puede asignarla a un cliente, lo que crea una copia
// de la rutina con user_id = cliente.id y assigned_to = cliente.id.
// ─────────────────────────────────────────────
function TemplateList({ user, onSelectTemplate }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [newName, setNewName]     = useState('')
  const [saving, setSaving]       = useState(false)
  // id de plantilla con panel de asignación abierto
  const [assigningId, setAssigningId] = useState(null)
  // clientes disponibles para asignar
  const [clients, setClients]         = useState([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [assigning, setAssigning]     = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  async function loadTemplates() {
    const { data } = await supabase
      .from('routines')
      .select('id, name, order')
      .eq('user_id', user.id)
      .eq('is_template', true)
      .order('created_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }

  useEffect(() => { loadTemplates() }, []) // eslint-disable-line

  async function createTemplate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    await supabase.from('routines').insert({
      name:        newName.trim(),
      user_id:     user.id,
      is_template: true,
    })
    setNewName('')
    setSaving(false)
    loadTemplates()
  }

  // Carga clientes conectados y abre el panel de asignación
  async function openAssign(templateId) {
    setAssigningId(templateId)
    setLoadingClients(true)
    const { data } = await supabase
      .from('trainer_connections')
      .select('client_id')
      .eq('trainer_id', user.id)
      .eq('active', true)
    const ids = (data || []).map(c => c.client_id).filter(Boolean)
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', ids)
      setClients(profiles || [])
    } else {
      setClients([])
    }
    setLoadingClients(false)
  }

  // Copia la plantilla al cliente: nueva rutina + copiar routine_exercises
  async function assignToClient(templateId, clientId) {
    setAssigning(true)

    // 1. Leer datos de la plantilla
    const { data: tpl } = await supabase
      .from('routines')
      .select('name, notes')
      .eq('id', templateId)
      .single()

    // 2. Crear nueva rutina para el cliente
    const { data: newRoutine, error } = await supabase
      .from('routines')
      .insert({
        name:        tpl.name,
        notes:       tpl.notes,
        user_id:     clientId,
        assigned_to: clientId,
        is_template: false,
        template_id: templateId,
      })
      .select('id')
      .single()

    if (error || !newRoutine) { setAssigning(false); return }

    // 3. Copiar los ejercicios de la plantilla a la nueva rutina
    const { data: exercises } = await supabase
      .from('routine_exercises')
      .select('exercise_id, block, sets, reps, weight_kg, duration_min, order, superset_group')
      .eq('routine_id', templateId)

    if (exercises?.length > 0) {
      await supabase.from('routine_exercises').insert(
        exercises.map(ex => ({ ...ex, routine_id: newRoutine.id }))
      )
    }

    setAssigning(false)
    setAssigningId(null)
    alert(`Rutina "${tpl.name}" asignada correctamente.`)
  }

  async function deleteTemplate(id) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setConfirmDeleteId(null)
    await supabase.from('routines').delete().eq('id', id)
    loadTemplates()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando plantillas...</div>

  return (
    <div className="p-4">
      {templates.length === 0 && (
        <p className="text-sm text-gray-400 mb-6">Aún no hay plantillas. Crea la primera abajo.</p>
      )}

      <div className="flex flex-col gap-2 mb-8">
        {templates.map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Fila principal */}
            <div className="flex items-center">
              <button
                onClick={() => onSelectTemplate(r)}
                className="flex-1 text-left px-4 py-3"
              >
                <span className="font-medium text-sm">{r.name}</span>
              </button>
              {/* Botón asignar */}
              <button
                onClick={() => assigningId === r.id ? setAssigningId(null) : openAssign(r.id)}
                className="text-xs px-3 py-3 text-gray-400 hover:text-black transition-colors"
              >
                Asignar
              </button>
              {/* Eliminar con doble confirmación */}
              <button
                onClick={() => deleteTemplate(r.id)}
                className={`text-xs px-3 py-3 transition-colors ${
                  confirmDeleteId === r.id ? 'text-red-500 font-semibold' : 'text-gray-300 hover:text-red-500'
                }`}
              >
                {confirmDeleteId === r.id ? '¿Eliminar?' : '×'}
              </button>
            </div>

            {/* Panel de asignación */}
            {assigningId === r.id && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 mb-2">Asignar a cliente:</p>
                {loadingClients ? (
                  <p className="text-xs text-gray-400">Cargando clientes...</p>
                ) : clients.length === 0 ? (
                  <p className="text-xs text-gray-400">No tienes clientes conectados.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {clients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => assignToClient(r.id, c.id)}
                        disabled={assigning}
                        className="text-left text-sm px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors disabled:opacity-50"
                      >
                        {c.name || 'Sin nombre'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Formulario nueva plantilla */}
      <div className="border border-gray-200 rounded-xl p-4 bg-white">
        <h2 className="font-semibold text-sm mb-3">Nueva plantilla</h2>
        <form onSubmit={createTemplate} className="flex gap-2">
          <input
            type="text"
            placeholder="Ej: Fullbody principiante"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : 'Crear'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// RoutineDetail — ejercicios de una rutina + añadir / eliminar /
//                 reordenar / superseries / edición inline
// ─────────────────────────────────────────────
function RoutineDetail({ routine, onBack }) {
  const [exercises, setExercises]       = useState([])
  const [catalog, setCatalog]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [form, setForm]                 = useState({
    exercise_id: '', block: 'main', sets: '', reps: '', weight_kg: '', duration_min: '',
  })
  const [muscleFilter, setMuscleFilter] = useState('')   // filtra el select de ejercicios al añadir
  const [adding, setAdding]             = useState(false)
  const [deleting, setDeleting]         = useState(null) // id del routine_exercise borrándose
  const [moving, setMoving]             = useState(null) // id del ejercicio moviéndose (↑↓)
  const [toggling, setToggling]         = useState(null) // "id1-id2" del par de superserie procesándose
  const [editingId, setEditingId]       = useState(null) // id del routine_exercise con form inline abierto
  const [editForm, setEditForm]         = useState({})   // { sets, reps, weight_kg, duration_min }
  const [savingEdit, setSavingEdit]     = useState(false)

  // Declarar las funciones antes del useEffect para que el linter de hooks no se queje
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

  useEffect(() => { loadExercises(); loadCatalog() }, []) // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps

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
  async function moveExercise(re, direction, blockExercises) {
    const idx = blockExercises.findIndex(e => e.id === re.id)
    const neighbor = blockExercises[idx + direction]
    if (!neighbor) return
    setMoving(re.id)
    await Promise.all([
      supabase.from('routine_exercises').update({ order: neighbor.order }).eq('id', re.id),
      supabase.from('routine_exercises').update({ order: re.order }).eq('id', neighbor.id),
    ])
    setMoving(null)
    loadExercises()
  }

  // Une o separa dos ejercicios consecutivos como superserie.
  // Si ya comparten superset_group → los separa (null en ambos).
  // Si no → les asigna el mismo grupo nuevo.
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
      const group = `ss_${crypto.randomUUID().slice(0, 8)}`
      await Promise.all([
        supabase.from('routine_exercises').update({ superset_group: group }).eq('id', reA.id),
        supabase.from('routine_exercises').update({ superset_group: group }).eq('id', reB.id),
      ])
    }
    setToggling(null)
    loadExercises()
  }

  // Abre el formulario inline de edición precargando los valores actuales del ejercicio
  function openEdit(re) {
    setEditingId(re.id)
    setEditForm({
      sets:         re.sets         ?? '',
      reps:         re.reps         ?? '',
      weight_kg:    re.weight_kg    ?? '',
      duration_min: re.duration_min ?? '',
    })
  }

  // Guarda los cambios del formulario inline y lo cierra
  async function saveEdit(reId) {
    setSavingEdit(true)
    await supabase.from('routine_exercises').update({
      sets:         editForm.sets         !== '' ? parseInt(editForm.sets)         : null,
      reps:         editForm.reps         !== '' ? parseInt(editForm.reps)         : null,
      weight_kg:    editForm.weight_kg    !== '' ? parseFloat(editForm.weight_kg)  : null,
      duration_min: editForm.duration_min !== '' ? parseInt(editForm.duration_min) : null,
    }).eq('id', reId)
    setSavingEdit(false)
    setEditingId(null)
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
              const next             = blockExercises[idx + 1]
              const isInSuperset     = !!re.superset_group
              const isJoinedWithNext = next && re.superset_group && re.superset_group === next.superset_group
              const toggleKey        = next ? `${re.id}-${next.id}` : null
              const isToggling       = toggleKey && toggling === toggleKey
              const isMoving         = moving === re.id
              const isEditing        = editingId === re.id
              const isTimed          = !!re.duration_min

              return (
                <div key={re.id}>
                  {/* ── Fila del ejercicio ── */}
                  <div className={`flex items-center bg-white border border-gray-200 rounded-lg
                    ${isInSuperset ? 'border-l-4 border-l-purple-500' : ''}
                    ${idx < blockExercises.length - 1 && !isEditing ? 'rounded-b-none border-b-0' : ''}`}
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

                    {/* Botón editar */}
                    <button
                      onClick={() => isEditing ? setEditingId(null) : openEdit(re)}
                      className={`text-xs px-2 transition-colors ${isEditing ? 'text-gray-900 font-medium' : 'text-gray-400 hover:text-black'}`}
                    >
                      {isEditing ? 'Cerrar' : 'Editar'}
                    </button>

                    {/* Botón eliminar */}
                    <button
                      onClick={() => removeExercise(re.id)}
                      disabled={deleting === re.id}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none px-3 disabled:opacity-30"
                      aria-label="Eliminar ejercicio"
                    >×</button>
                  </div>

                  {/* ── Formulario inline de edición ── */}
                  {isEditing && (
                    <div className="bg-gray-50 border border-gray-200 border-t-0 rounded-b-lg px-3 py-3 mb-1">
                      {isTimed ? (
                        // Ejercicio por tiempo: solo duración
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-500 shrink-0">Duración (min)</label>
                          <input
                            type="number" min="1"
                            value={editForm.duration_min}
                            onChange={e => setEditForm(f => ({ ...f, duration_min: e.target.value }))}
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
                          />
                        </div>
                      ) : (
                        // Ejercicio de fuerza: series, reps y peso
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Series',  field: 'sets',      step: '1' },
                            { label: 'Reps',    field: 'reps',      step: '1' },
                            { label: 'Peso kg', field: 'weight_kg', step: '0.5' },
                          ].map(({ label, field, step }) => (
                            <div key={field}>
                              <label className="text-xs text-gray-500 block mb-1">{label}</label>
                              <input
                                type="number" step={step} min="0"
                                value={editForm[field]}
                                onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-gray-400"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => saveEdit(re.id)}
                        disabled={savingEdit}
                        className="mt-2 w-full bg-gray-900 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
                      >
                        {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  )}

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

  async function loadExercises() {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, description')
      .order('name')
    setExercises(data || [])
    setLoading(false)
  }

  useEffect(() => { loadExercises() }, []) // eslint-disable-line react-hooks/set-state-in-effect

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
