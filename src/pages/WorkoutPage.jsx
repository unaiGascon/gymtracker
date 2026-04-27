// Pantalla "Entrenamiento"
// Recibe el id y nombre de la rutina elegida en HomePage.
// Muestra los ejercicios agrupados por bloque, permite registrar
// series (reps + peso) y guarda el entrenamiento al finalizar.
//
// Borrador en localStorage:
//   - Clave: "workout_draft_{routineId}"
//   - Valor: JSON con { exercise_id: [{reps, weight, confirmed}, ...] }
//   - Se actualiza en cada cambio de input y al confirmar una serie
//   - Se carga al montar si existe (sesión interrumpida)
//   - Se elimina al finalizar el entrenamiento
//
// Confirmación de serie (botón cuarta columna):
//   - Cada serie tiene un botón que muestra el dato anterior ("11r × 35") o "✓" si es nuevo
//   - Al pulsarlo: arranca el temporizador de descanso (excepto última serie) y queda marcado
//   - Una vez marcado no se puede volver a pulsar — evita reiniciar el timer accidentalmente
//   - El estado confirmed se guarda en el borrador de localStorage
//
// Temporizador de descanso:
//   - Solo se arranca desde el botón de confirmación de serie
//   - Duración leída desde profiles.rest_seconds (default 90s)
//   - Tipo de aviso leído desde profiles.rest_alert: 'vibrate' | 'sound' | 'both' (default 'both')
//   - Si rest_seconds = 0, el temporizador está desactivado

import { useState, useEffect, useRef } from 'react'
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

// Hace parpadear la pantalla 2-3 veces con un overlay blanco semitransparente.
// Crea un div temporal, anima su opacidad con setTimeout y lo elimina al acabar.
function playFlash() {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;pointer-events:none;opacity:0;transition:opacity 80ms'
  document.body.appendChild(el)

  // Secuencia: 0 → 0.85 → 0 → 0.85 → 0 → eliminar
  const steps = [
    [10,  0.85],
    [130, 0],
    [220, 0.85],
    [350, 0],
    [460, null],  // null = eliminar el div
  ]
  steps.forEach(([ms, opacity]) => {
    setTimeout(() => {
      if (opacity === null) { el.remove() }
      else { el.style.opacity = opacity }
    }, ms)
  })
}

// Genera un beep corto con Web Audio API — sin archivos externos
function playBeep() {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  } catch {
    // AudioContext bloqueado por el browser (requiere interacción previa) — ignorar
  }
}

// ─────────────────────────────────────────────
// Componente principal
// Props:
//   routineId   — uuid de la rutina elegida en HomePage
//   routineName — nombre para mostrarlo en cabecera
//   onFinish    — callback al ver historial tras guardar
//   onBack      — callback para volver a HomePage
// ─────────────────────────────────────────────
export default function WorkoutPage({ user, routineId, routineName, onFinish, onBack }) {
  const [exercises, setExercises]       = useState([])
  const [previousSets, setPreviousSets] = useState({})  // { exercise_id: [{set_number, reps_done, weight_done}] }
  const [currentSets, setCurrentSets]   = useState({})  // { exercise_id: [{reps:'', weight:''}] }
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [hasDraft, setHasDraft]         = useState(false)  // true si se recuperó un borrador al cargar
  const [showConfirm, setShowConfirm]   = useState(false)

  // Temporizador de descanso
  const [restSeconds, setRestSeconds] = useState(90)      // cargado desde profiles.rest_seconds
  const [restAlert, setRestAlert]     = useState('both')  // 'vibrate' | 'sound' | 'both'
  const [restTimer, setRestTimer]     = useState(null)    // null | { left, total, label }
  const timerRef   = useRef(null)   // ref al setInterval para poder cancelarlo
  const hasStarted = useRef(false)  // true tras el primer input del usuario; evita guardar activeRoutineId al montar

  // Clave de localStorage para el borrador de series de esta rutina
  const draftKey = `workout_draft_${routineId}`

  useEffect(() => { loadExercises(routineId) }, [routineId])

  // Cargar rest_seconds y rest_alert del perfil del usuario
  useEffect(() => {
    async function loadRestPrefs() {
      const { data } = await supabase
        .from('profiles')
        .select('rest_seconds, rest_alert')
        .eq('id', user.id)
        .single()
      if (data?.rest_seconds != null) setRestSeconds(data.rest_seconds)
      if (data?.rest_alert)           setRestAlert(data.rest_alert)
    }
    loadRestPrefs()
  }, [user.id])

  // Limpiar el intervalo al desmontar el componente
  useEffect(() => {
    return () => clearInterval(timerRef.current)
  }, [])

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
      initSets[re.exercise_id] = Array.from({ length: numSets }, () => ({ reps: '', weight: '', confirmed: false }))
    }

    // Comprobar si hay un borrador guardado en localStorage para esta rutina
    const raw = localStorage.getItem(`workout_draft_${id}`)
    if (raw) {
      try {
        const draft = JSON.parse(raw)
        // Mezclar el borrador con initSets: solo sobreescribir lo que exista en ambos
        for (const exerciseId of Object.keys(draft)) {
          if (!initSets[exerciseId]) continue
          draft[exerciseId].forEach((s, idx) => {
            if (initSets[exerciseId][idx]) {
              // confirmed: false como fallback para borradores guardados antes de esta versión
              initSets[exerciseId][idx] = { confirmed: false, ...s }
            }
          })
        }
        setHasDraft(true)
      } catch {
        // JSON corrupto — ignorar el borrador
        localStorage.removeItem(`workout_draft_${id}`)
      }
    }

    setCurrentSets(initSets)

    // Cargar "anterior": el último workout_log completado por ejercicio
    await loadPreviousSets(reData.map(re => re.exercise_id))
    setLoading(false)
  }

  // Busca las series del último entrenamiento COMPLETADO por ejercicio.
  async function loadPreviousSets(exerciseIds) {
    if (exerciseIds.length === 0) return

    const { data } = await supabase
      .from('log_sets')
      .select('exercise_id, set_number, reps_done, weight_done, log_id, workout_logs!inner(logged_date, completed)')
      .in('exercise_id', exerciseIds)
      .eq('workout_logs.completed', true)
      .order('set_number')

    if (!data) return

    // Para cada ejercicio, quedarse solo con las series del log más reciente
    const latestLog = {}
    for (const s of data) {
      const date = s.workout_logs?.logged_date || ''
      if (!latestLog[s.exercise_id] || date > latestLog[s.exercise_id].date) {
        latestLog[s.exercise_id] = { logId: s.log_id, date }
      }
    }

    const prev = {}
    for (const s of data) {
      if (s.log_id === latestLog[s.exercise_id]?.logId) {
        if (!prev[s.exercise_id]) prev[s.exercise_id] = []
        prev[s.exercise_id].push(s)
      }
    }

    setPreviousSets(prev)
  }

  // Actualiza un campo de una serie y persiste el estado completo en localStorage
  function updateSet(exerciseId, setIndex, field, value) {
    // Primera vez que el usuario escribe algo: marcar la rutina como activa en localStorage.
    // Se hace aquí y no al montar para evitar que simplemente abrir la pantalla
    // active el "entrenamiento en curso" sin haber registrado ningún dato.
    if (value !== '' && !hasStarted.current) {
      hasStarted.current = true
      localStorage.setItem('activeRoutineId',   routineId)
      localStorage.setItem('activeRoutineName', routineName)
    }

    setCurrentSets(prev => {
      const updated = {
        ...prev,
        [exerciseId]: prev[exerciseId].map((s, i) =>
          i === setIndex ? { ...s, [field]: value } : s
        ),
      }
      // Guardar el estado completo en localStorage tras cada cambio
      localStorage.setItem(draftKey, JSON.stringify(updated))
      return updated
    })
  }

  // Arranca el temporizador de descanso con el tiempo configurado en el perfil.
  // Si ya hay un temporizador activo, ignora la llamada — no reinicia.
  // label: texto informativo con la siguiente serie (ej: "Serie 2 · Press banca")
  function startRest(label) {
    if (restSeconds <= 0) return        // temporizador desactivado
    if (restTimer !== null) return      // ya está corriendo — no reiniciar
    clearInterval(timerRef.current)
    setRestTimer({ left: restSeconds, total: restSeconds, label })
    timerRef.current = setInterval(() => {
      setRestTimer(prev => {
        if (!prev) return null
        if (prev.left <= 1) {
          // Tiempo agotado: aplicar aviso según preferencia y cerrar panel
          clearInterval(timerRef.current)
          if (restAlert === 'sound' || restAlert === 'both') playBeep()
          if (restAlert === 'vibrate' || restAlert === 'both') navigator.vibrate?.([200, 100, 200])
          playFlash()
          return null
        }
        return { ...prev, left: prev.left - 1 }
      })
    }, 1000)
  }

  // Cancela el temporizador manualmente (botón "Saltar descanso")
  function skipRest() {
    clearInterval(timerRef.current)
    setRestTimer(null)
  }

  // Crea el workout_log + log_sets en Supabase y limpia el borrador
  async function finishWorkout() {
    // Cancelar el temporizador si está activo
    clearInterval(timerRef.current)
    setRestTimer(null)
    setSaving(true)

    const { data: logData, error } = await supabase
      .from('workout_logs')
      .insert({ routine_id: routineId, user_id: user.id })
      .select('id')
      .single()

    if (error || !logData) {
      alert('Error al guardar. Comprueba la conexión.')
      setSaving(false)
      return
    }

    // Construir el array de series a insertar (solo las que tengan reps o peso)
    const setsToInsert = []
    for (const [exerciseId, setsArr] of Object.entries(currentSets)) {
      for (let i = 0; i < setsArr.length; i++) {
        const { reps, weight } = setsArr[i]
        if (reps !== '' || weight !== '') {
          setsToInsert.push({
            log_id:      logData.id,
            exercise_id: exerciseId,
            set_number:  i + 1,
            reps_done:   reps   !== '' ? parseInt(reps)     : null,
            weight_done: weight !== '' ? parseFloat(weight) : null,
          })
        }
      }
    }

    if (setsToInsert.length > 0) {
      await supabase.from('log_sets').insert(setsToInsert)
    }

    // Borrar el borrador y la marca de rutina activa — ya está guardado en Supabase
    localStorage.removeItem(draftKey)
    localStorage.removeItem('activeRoutineId')
    localStorage.removeItem('activeRoutineName')

    setSaving(false)
    setSaved(true)
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
    <div className="p-4">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-black text-lg leading-none"
          aria-label="Volver al inicio"
        >←</button>
        <div>
          <h1 className="text-xl font-bold">{routineName}</h1>
          {/* Aviso visual si se están retomando valores guardados */}
          {hasDraft && (
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
          onRestStart={startRest}
        />
      ))}

      {/* Temporizador de descanso — panel flotante sobre el botón finalizar */}
      {restTimer && (
        <RestTimer
          secondsLeft={restTimer.left}
          total={restTimer.total}
          label={restTimer.label}
          onSkip={skipRest}
        />
      )}

      {/* Botón "Finalizar" — al final del contenido, requiere scroll hasta abajo */}
      <div className="mt-6 mb-8">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={saving}
          className="w-full bg-black text-white font-bold py-3 rounded-xl text-base disabled:opacity-50"
        >
          Finalizar entrenamiento
        </button>
      </div>

      {/* Modal de confirmación */}
      {showConfirm && (
        <ConfirmFinishModal
          currentSets={currentSets}
          exercises={exercises}
          saving={saving}
          onConfirm={() => { setShowConfirm(false); finishWorkout() }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// RestTimer — panel flotante con cuenta atrás
// Se muestra encima del botón "Finalizar"
// ─────────────────────────────────────────────
function RestTimer({ secondsLeft, total, label, onSkip }) {
  const minutes = Math.floor(secondsLeft / 60)
  const secs    = secondsLeft % 60
  const pct     = (secondsLeft / total) * 100  // 100% al inicio, 0% al final

  return (
    <div className="fixed bottom-4 left-0 right-0 px-4 z-40">
      <div className="bg-gray-900 text-white rounded-2xl p-5 shadow-2xl">
        {/* Cuenta atrás con número grande */}
        <div className="text-center mb-3">
          <div className="text-5xl font-bold tabular-nums leading-none">
            {minutes}:{String(secs).padStart(2, '0')}
          </div>
          {label && (
            <p className="text-xs text-gray-400 mt-2">Siguiente: {label}</p>
          )}
        </div>

        {/* Barra de progreso que se vacía de izquierda a derecha */}
        <div className="h-1.5 bg-gray-700 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Botón para saltar el descanso */}
        <button
          onClick={onSkip}
          className="w-full text-sm text-gray-400 hover:text-white transition-colors py-1"
        >
          Saltar descanso →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// BlockSection: cabecera coloreada + ejercicios del bloque
// ─────────────────────────────────────────────
function BlockSection({ block, exercises, previousSets, currentSets, onUpdateSet, onRestStart }) {
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
                onRestStart={onRestStart}
              />
            : <SupersetGroup
                key={i}
                exercises={group}
                previousSets={previousSets}
                currentSets={currentSets}
                onUpdateSet={onUpdateSet}
                onRestStart={onRestStart}
              />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SupersetGroup: barra morada lateral + etiqueta + ejercicios
// ─────────────────────────────────────────────
function SupersetGroup({ exercises, previousSets, currentSets, onUpdateSet, onRestStart }) {
  return (
    <div className="flex">
      <div className="w-1 bg-purple-500 flex-shrink-0 rounded-bl-lg" />
      <div className="flex-1 divide-y divide-gray-100">
        <div className="px-3 pt-2 pb-0">
          <span className="text-purple-600 text-xs font-bold tracking-widest">SUPERSERIE</span>
        </div>
        {exercises.map((re, i) => (
          <ExerciseCard
            key={re.id}
            re={re}
            prevSets={previousSets[re.exercise_id] || []}
            currSets={currentSets[re.exercise_id]  || []}
            onUpdate={onUpdateSet}
            // El temporizador solo arranca al completar una serie del último ejercicio del grupo
            onRestStart={i === exercises.length - 1 ? onRestStart : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Convierte una URL normal de YouTube a URL de embed.
//   youtube.com/watch?v=ID  →  youtube.com/embed/ID
//   youtu.be/ID             →  youtube.com/embed/ID
// Devuelve null si no puede extraer el ID.
// ─────────────────────────────────────────────
function toEmbedUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    // Formato largo: youtube.com/watch?v=ID
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    // Formato corto: youtu.be/ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
  } catch { /* URL inválida */ }
  return null
}

// ─────────────────────────────────────────────
// ExerciseCard: nombre del ejercicio + contenido según tipo
// ─────────────────────────────────────────────
function ExerciseCard({ re, prevSets, currSets, onUpdate, onRestStart }) {
  const exercise    = re.exercises
  const isTimed     = !!re.duration_min
  // El ejercicio se marca como completado cuando todas sus series están confirmadas
  const allConfirmed = !isTimed && currSets.length > 0 && currSets.every(s => s.confirmed)

  const [showVideo, setShowVideo] = useState(false)
  const embedUrl = toEmbedUrl(exercise?.video_url)

  // Llamado al pulsar el botón de confirmación de una serie.
  // Requiere reps Y peso informados; si falta alguno, ignora la pulsación.
  // Persiste confirmed=true en el borrador y arranca el descanso (excepto en la última serie).
  function handleConfirmSet(setIndex) {
    const set = currSets[setIndex]
    if (!set || set.reps === '' || set.weight === '') return  // serie incompleta — no confirmar
    onUpdate(re.exercise_id, setIndex, 'confirmed', true)
    const isLastSet = setIndex === currSets.length - 1
    if (!isLastSet) {
      const nextNum = setIndex + 2
      onRestStart?.(`Serie ${nextNum} · ${exercise?.name ?? ''}`)
    }
  }

  return (
    <div className={`px-3 py-3 transition-opacity ${allConfirmed ? 'opacity-40' : 'opacity-100'}`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-semibold text-sm">{exercise?.name}</span>
        {exercise?.muscle_group && (
          <span className="text-xs text-gray-400">{exercise.muscle_group}</span>
        )}
        {embedUrl && (
          <button
            onClick={() => setShowVideo(v => !v)}
            className="text-xs text-red-500 font-medium hover:text-red-700 transition-colors ml-1"
          >
            {showVideo ? '✕ Cerrar' : '▶ Ver vídeo'}
          </button>
        )}
      </div>

      {/* Iframe de YouTube — se monta/desmonta para detener el vídeo al cerrar */}
      {showVideo && embedUrl && (
        <div className="mb-3">
          <iframe
            src={embedUrl}
            title="Vídeo del ejercicio"
            width="100%"
            height="200"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="rounded-xl border-0"
          />
        </div>
      )}

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
            <span className="text-center">Peso</span>
            <span className="text-center">✓</span>
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
              confirmed={set.confirmed ?? false}
              onUpdate={onUpdate}
              onConfirm={handleConfirmSet}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ConfirmFinishModal — resumen antes de guardar
// ─────────────────────────────────────────────
function ConfirmFinishModal({ currentSets, exercises, saving, onConfirm, onCancel }) {
  // Contar ejercicios con al menos una serie registrada y total de series
  let filledExercises = 0
  let totalSets = 0
  for (const [, sets] of Object.entries(currentSets)) {
    const filled = sets.filter(s => s.reps !== '' || s.weight !== '')
    if (filled.length > 0) { filledExercises++; totalSets += filled.length }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 px-4 pb-6">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold mb-1">¿Finalizar el entrenamiento?</h2>
        <p className="text-sm text-gray-500 mb-4">Esto guardará el registro en tu historial.</p>

        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold">{filledExercises}</p>
            <p className="text-xs text-gray-500">ejercicio{filledExercises !== 1 ? 's' : ''}</p>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="text-center">
            <p className="text-2xl font-bold">{totalSets}</p>
            <p className="text-xs text-gray-500">serie{totalSets !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <button
          onClick={onConfirm}
          disabled={saving}
          className="w-full bg-black text-white font-bold py-3 rounded-xl text-sm mb-2 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Sí, finalizar'}
        </button>
        <button
          onClick={onCancel}
          className="w-full text-sm text-gray-500 py-2"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SetRow: una serie — número, input reps, input peso, botón de confirmación
//
// El botón (cuarta columna):
//   - Sin confirmar: muestra el dato anterior ("11r × 35") o "✓" si no hay historial
//   - Al pulsar: llama a onConfirm, que marca la serie y arranca el descanso
//   - Confirmado: fondo negro, "✓", deshabilitado (no se puede pulsar de nuevo)
// ─────────────────────────────────────────────
function SetRow({ setIndex, setNumber, reps, weight, prevSet, exerciseId, confirmed, onUpdate, onConfirm }) {
  const beatsReps   = prevSet && reps   !== '' && parseInt(reps)     > prevSet.reps_done
  const beatsWeight = prevSet && weight !== '' && parseFloat(weight) > prevSet.weight_done

  // Label del botón antes de confirmar: dato anterior o "✓" si es ejercicio nuevo
  const confirmLabel = prevSet
    ? `${prevSet.reps_done ?? '?'}r × ${prevSet.weight_done ?? '?'}`
    : '✓'

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

      {/* Botón de confirmación — una vez pulsado queda bloqueado en negro */}
      <button
        onClick={() => onConfirm(setIndex)}
        disabled={confirmed}
        className={`text-xs font-medium rounded-lg h-8 w-full transition-colors ${
          confirmed
            ? 'bg-gray-900 text-white cursor-default'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300'
        }`}
      >
        {confirmed ? '✓' : confirmLabel}
      </button>
    </div>
  )
}
