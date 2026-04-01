// Pantalla "Entrenamiento"
// Recibe el id y nombre de la rutina elegida en HomePage.
// Muestra los ejercicios agrupados por bloque, permite registrar
// series (reps + peso) y guarda el entrenamiento al finalizar.
//
// Funcionalidad de sesión parcial:
//   - Al montar, busca un workout_log de hoy con completed=false para esta rutina.
//     Si existe, pre-rellena los inputs con las series ya guardadas.
//   - Al intentar salir con progreso sin finalizar, muestra un modal:
//       * "Guardar progreso y salir" → guarda/actualiza con completed=false
//       * "Salir sin guardar"        → navega sin guardar nada
//   - "Finalizar entrenamiento" guarda con completed=true (sesión completa).

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLOCK_COLORS = {
  warmup:   'bg-orange-500',
  main:     'bg-gray-900',
  cardio:   'bg-green-600',
  cooldown: 'bg-purple-600',
}
const BLOCK_LABELS = {
  warmup:   'Calentamiento',
  main:     'Bloque principal',
  cardio:   'Cardio',
  cooldown: 'Vuelta a la calma',
}
const BLOCK_ORDER = ['warmup', 'main', 'cardio', 'cooldown']

// ─────────────────────────────────────────────
// Componente principal
// Props:
//   routineId   — uuid de la rutina elegida en HomePage
//   routineName — nombre para mostrarlo en cabecera
//   onFinish    — callback al ver historial tras guardar
//   onBack      — callback para volver a HomePage
// ─────────────────────────────────────────────
export default function WorkoutPage({ routineId, routineName, onFinish, onBack }) {
  const [exercises, setExercises]       = useState([])
  const [previousSets, setPreviousSets] = useState({})  // { exercise_id: [{set_number, reps_done, weight_done}] }
  const [currentSets, setCurrentSets]   = useState({})  // { exercise_id: [{reps:'', weight:''}] }
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [draftLogId, setDraftLogId]     = useState(null) // id del workout_log parcial de hoy, si existe

  // Modal de salida: destino al que navegar si el usuario confirma
  const [exitDestination, setExitDestination] = useState(null) // 'back' | 'finish' | null

  useEffect(() => { loadExercises(routineId) }, [routineId])

  async function loadExercises(id) {
    setLoading(true)

    const { data: reData } = await supabase
      .from('routine_exercises')
      .select('*, exercises(*)')
      .eq('routine_id', id)
      .order('order')

    if (!reData) { setLoading(false); return }

    setExercises(reData)

    // Inicializar inputs vacíos (los de duration_min no tienen inputs)
    const initSets = {}
    for (const re of reData) {
      if (re.duration_min) continue
      const numSets = re.sets || 3
      initSets[re.exercise_id] = Array.from({ length: numSets }, () => ({ reps: '', weight: '' }))
    }

    // Buscar draft de hoy (completed=false) para esta rutina.
    // Se selecciona el campo completed para verificarlo en JS también,
    // evitando pre-rellenar si hay un log completado de hoy.
    const today = new Date().toISOString().slice(0, 10)
    const { data: draftLog } = await supabase
      .from('workout_logs')
      .select('id, completed')
      .eq('routine_id', id)
      .eq('logged_date', today)
      .eq('completed', false)
      .maybeSingle()

    if (draftLog && draftLog.completed === false) {
      // Hay un draft: cargar sus series y pre-rellenar los inputs
      setDraftLogId(draftLog.id)
      const { data: draftSets } = await supabase
        .from('log_sets')
        .select('exercise_id, set_number, reps_done, weight_done')
        .eq('log_id', draftLog.id)

      if (draftSets) {
        for (const s of draftSets) {
          if (!initSets[s.exercise_id]) continue
          const idx = s.set_number - 1
          if (initSets[s.exercise_id][idx]) {
            initSets[s.exercise_id][idx] = {
              reps:   s.reps_done   != null ? String(s.reps_done)   : '',
              weight: s.weight_done != null ? String(s.weight_done) : '',
            }
          }
        }
      }
    }

    setCurrentSets(initSets)

    // Cargar "anterior" solo de sesiones completadas (no del draft actual)
    await loadPreviousSets(reData.map(re => re.exercise_id), draftLog?.id ?? null)
    setLoading(false)
  }

  // Busca las series del último entrenamiento COMPLETADO por ejercicio.
  // Excluye el draftLogId para no comparar contra el draft de hoy.
  async function loadPreviousSets(exerciseIds, excludeLogId) {
    if (exerciseIds.length === 0) return

    let query = supabase
      .from('log_sets')
      .select('exercise_id, set_number, reps_done, weight_done, log_id, workout_logs(logged_date, completed)')
      .in('exercise_id', exerciseIds)
      .order('set_number')

    const { data } = await query
    if (!data) return

    // Quedarse solo con series de logs completados y que no sean el draft actual
    const completedSets = data.filter(s =>
      s.workout_logs?.completed === true && s.log_id !== excludeLogId
    )

    const latestLog = {}
    for (const s of completedSets) {
      const date = s.workout_logs?.logged_date || ''
      if (!latestLog[s.exercise_id] || date > latestLog[s.exercise_id].date) {
        latestLog[s.exercise_id] = { logId: s.log_id, date }
      }
    }

    const prev = {}
    for (const s of completedSets) {
      if (s.log_id === latestLog[s.exercise_id]?.logId) {
        if (!prev[s.exercise_id]) prev[s.exercise_id] = []
        prev[s.exercise_id].push(s)
      }
    }

    setPreviousSets(prev)
  }

  function updateSet(exerciseId, setIndex, field, value) {
    setCurrentSets(prev => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) =>
        i === setIndex ? { ...s, [field]: value } : s
      ),
    }))
  }

  // Devuelve true si el usuario ha rellenado al menos un input
  function hasProgress() {
    return Object.values(currentSets).some(sets =>
      sets.some(s => s.reps !== '' || s.weight !== '')
    )
  }

  // Prepara el array de series con datos para insertar/actualizar
  function buildSetsToSave(logId) {
    const sets = []
    for (const [exerciseId, setsArr] of Object.entries(currentSets)) {
      for (let i = 0; i < setsArr.length; i++) {
        const { reps, weight } = setsArr[i]
        if (reps !== '' || weight !== '') {
          sets.push({
            log_id:      logId,
            exercise_id: exerciseId,
            set_number:  i + 1,
            reps_done:   reps   !== '' ? parseInt(reps)     : null,
            weight_done: weight !== '' ? parseFloat(weight) : null,
          })
        }
      }
    }
    return sets
  }

  // Guarda (o actualiza) el log con el flag completed dado y navega al destino
  async function saveAndNavigate(completed, destination) {
    setSaving(true)
    setExitDestination(null)

    let logId = draftLogId

    if (logId) {
      // Ya existe un draft: actualizar su estado completed
      await supabase
        .from('workout_logs')
        .update({ completed })
        .eq('id', logId)

      // Eliminar las series antiguas del draft y reinsertar las actuales
      await supabase.from('log_sets').delete().eq('log_id', logId)
    } else {
      // No hay draft: crear el log nuevo
      const { data: logData, error } = await supabase
        .from('workout_logs')
        .insert({ routine_id: routineId, completed })
        .select('id')
        .single()

      if (error || !logData) {
        alert('Error al guardar. Comprueba la conexión.')
        setSaving(false)
        return
      }
      logId = logData.id
      if (!completed) setDraftLogId(logId)
    }

    const setsToInsert = buildSetsToSave(logId)
    if (setsToInsert.length > 0) {
      await supabase.from('log_sets').insert(setsToInsert)
    }

    setSaving(false)

    if (completed) {
      setSaved(true)
    } else {
      // Sesión parcial: navegar al destino
      if (destination === 'finish') onFinish()
      else onBack()
    }
  }

  // Llamado por los botones ← y "Ver historial" antes de salir
  // Si hay progreso sin guardar, muestra el modal; si no, sale directamente
  function handleNavigate(destination) {
    if (hasProgress()) {
      setExitDestination(destination)  // abre el modal
    } else {
      if (destination === 'finish') onFinish()
      else onBack()
    }
  }

  // ── Pantalla de confirmación tras finalizar ──
  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="text-5xl mb-4">💪</div>
        <h2 className="text-2xl font-bold mb-2">¡Entrenamiento guardado!</h2>
        <p className="text-gray-500 mb-6">Buen trabajo.</p>
        <button onClick={onBack} className="px-6 py-2 bg-black text-white rounded-lg font-medium">
          Volver al inicio
        </button>
        <button onClick={onFinish} className="mt-3 px-6 py-2 text-gray-500 underline text-sm">
          Ver historial
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando rutina...</div>
  }

  const byBlock = {}
  for (const re of exercises) {
    if (!byBlock[re.block]) byBlock[re.block] = []
    byBlock[re.block].push(re)
  }

  return (
    <div className="p-4 pb-28">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => handleNavigate('back')}
          className="text-gray-400 hover:text-black text-lg leading-none"
          aria-label="Volver al inicio"
        >←</button>
        <div>
          <h1 className="text-xl font-bold">{routineName}</h1>
          {/* Aviso visual si se está retomando un draft */}
          {draftLogId && (
            <p className="text-xs text-orange-500 font-medium">Retomando sesión guardada</p>
          )}
        </div>
      </div>

      {BLOCK_ORDER.filter(b => byBlock[b]).map(block => (
        <BlockSection
          key={block}
          block={block}
          exercises={byBlock[block]}
          previousSets={previousSets}
          currentSets={currentSets}
          onUpdateSet={updateSet}
        />
      ))}

      {/* Botón "Finalizar" fijo abajo */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-200">
        <button
          onClick={() => saveAndNavigate(true, null)}
          disabled={saving}
          className="w-full bg-black text-white font-bold py-3 rounded-xl text-base disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Finalizar entrenamiento'}
        </button>
      </div>

      {/* Modal de salida con progreso sin finalizar */}
      {exitDestination && (
        <ExitModal
          onSaveAndExit={() => saveAndNavigate(false, exitDestination)}
          onExitWithoutSaving={() => {
            setExitDestination(null)
            if (exitDestination === 'finish') onFinish()
            else onBack()
          }}
          onCancel={() => setExitDestination(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ExitModal — modal de confirmación al salir con progreso
// ─────────────────────────────────────────────
function ExitModal({ onSaveAndExit, onExitWithoutSaving, onCancel, saving }) {
  return (
    // Fondo oscuro semitransparente
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="font-bold text-lg mb-1">¿Salir del entrenamiento?</h2>
        <p className="text-sm text-gray-500 mb-6">
          Tienes series registradas. ¿Qué quieres hacer con el progreso?
        </p>

        {/* Guardar y salir */}
        <button
          onClick={onSaveAndExit}
          disabled={saving}
          className="w-full bg-black text-white font-medium py-3 rounded-xl mb-2 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar progreso y salir'}
        </button>

        {/* Salir sin guardar */}
        <button
          onClick={onExitWithoutSaving}
          className="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-xl mb-2"
        >
          Salir sin guardar
        </button>

        {/* Cancelar — volver al entrenamiento */}
        <button
          onClick={onCancel}
          className="w-full text-gray-400 text-sm py-2"
        >
          Cancelar — seguir entrenando
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// BlockSection: cabecera coloreada + ejercicios del bloque
// ─────────────────────────────────────────────
function BlockSection({ block, exercises, previousSets, currentSets, onUpdateSet }) {
  const groups = []
  const seenSuperset = new Set()
  for (const ex of exercises) {
    if (!ex.superset_group) {
      groups.push([ex])
    } else if (!seenSuperset.has(ex.superset_group)) {
      seenSuperset.add(ex.superset_group)
      groups.push(exercises.filter(e => e.superset_group === ex.superset_group))
    }
  }

  return (
    <div className="mb-5">
      <div className={`${BLOCK_COLORS[block]} text-white px-4 py-2 rounded-t-lg font-semibold text-xs uppercase tracking-widest`}>
        {BLOCK_LABELS[block]}
      </div>
      <div className="border border-gray-200 border-t-0 rounded-b-lg divide-y divide-gray-100">
        {groups.map((group, i) =>
          group.length === 1
            ? <ExerciseCard
                key={group[0].id}
                re={group[0]}
                prevSets={previousSets[group[0].exercise_id] || []}
                currSets={currentSets[group[0].exercise_id]  || []}
                onUpdate={onUpdateSet}
              />
            : <SupersetGroup
                key={i}
                exercises={group}
                previousSets={previousSets}
                currentSets={currentSets}
                onUpdateSet={onUpdateSet}
              />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SupersetGroup: barra morada lateral + etiqueta + ejercicios
// ─────────────────────────────────────────────
function SupersetGroup({ exercises, previousSets, currentSets, onUpdateSet }) {
  return (
    <div className="flex">
      <div className="w-1 bg-purple-500 flex-shrink-0 rounded-bl-lg" />
      <div className="flex-1 divide-y divide-gray-100">
        <div className="px-3 pt-2 pb-0">
          <span className="text-purple-600 text-xs font-bold tracking-widest">SUPERSERIE</span>
        </div>
        {exercises.map(re => (
          <ExerciseCard
            key={re.id}
            re={re}
            prevSets={previousSets[re.exercise_id] || []}
            currSets={currentSets[re.exercise_id]  || []}
            onUpdate={onUpdateSet}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ExerciseCard: nombre del ejercicio + contenido según tipo
// ─────────────────────────────────────────────
function ExerciseCard({ re, prevSets, currSets, onUpdate }) {
  const exercise = re.exercises
  const isTimed  = !!re.duration_min
  const allFilled = !isTimed && currSets.length > 0 && currSets.every(s => s.reps !== '' && s.weight !== '')

  return (
    <div className={`px-3 py-3 transition-opacity ${allFilled ? 'opacity-40' : 'opacity-100'}`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-semibold text-sm">{exercise?.name}</span>
        {exercise?.muscle_group && (
          <span className="text-xs text-gray-400">{exercise.muscle_group}</span>
        )}
      </div>

      {isTimed ? (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-700">{re.duration_min}</span>
          <span className="text-sm text-gray-400">min</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1.5rem_1fr_1fr_4rem] gap-2 text-xs text-gray-400 mb-1">
            <span className="text-center">#</span>
            <span className="text-center">Reps</span>
            <span className="text-center">Peso kg</span>
            <span className="text-center">Anterior</span>
          </div>
          {currSets.map((set, i) => (
            <SetRow
              key={i}
              setIndex={i}
              setNumber={i + 1}
              reps={set.reps}
              weight={set.weight}
              prevSet={prevSets.find(p => p.set_number === i + 1)}
              exerciseId={re.exercise_id}
              onUpdate={onUpdate}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SetRow: una serie — número, input reps, input peso, dato anterior
// ─────────────────────────────────────────────
function SetRow({ setIndex, setNumber, reps, weight, prevSet, exerciseId, onUpdate }) {
  const beatsReps   = prevSet && reps   !== '' && parseInt(reps)     > prevSet.reps_done
  const beatsWeight = prevSet && weight !== '' && parseFloat(weight) > prevSet.weight_done

  const prevText = prevSet
    ? `${prevSet.reps_done ?? '?'}r × ${prevSet.weight_done ?? '?'}kg`
    : '—'

  return (
    <div className="grid grid-cols-[1.5rem_1fr_1fr_4rem] gap-2 items-center mb-1.5">
      <span className="text-xs text-gray-400 text-center">{setNumber}</span>

      <div className="relative">
        <input
          type="number" inputMode="numeric"
          placeholder="—"
          value={reps}
          onChange={e => onUpdate(exerciseId, setIndex, 'reps', e.target.value)}
          className={`w-full border rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:ring-1
            ${beatsReps ? 'border-green-400 text-green-700 bg-green-50 focus:ring-green-400' : 'border-gray-300 focus:ring-gray-400'}`}
        />
        {beatsReps && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-green-500 text-xs font-bold pointer-events-none">↑</span>}
      </div>

      <div className="relative">
        <input
          type="number" inputMode="decimal" step="0.5"
          placeholder="—"
          value={weight}
          onChange={e => onUpdate(exerciseId, setIndex, 'weight', e.target.value)}
          className={`w-full border rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:ring-1
            ${beatsWeight ? 'border-green-400 text-green-700 bg-green-50 focus:ring-green-400' : 'border-gray-300 focus:ring-gray-400'}`}
        />
        {beatsWeight && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-green-500 text-xs font-bold pointer-events-none">↑</span>}
      </div>

      <span className="text-xs text-gray-400 text-center leading-tight">{prevText}</span>
    </div>
  )
}
