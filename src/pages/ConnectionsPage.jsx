// Página de gestión de conexiones entrenador-cliente.
//
// Dos pestañas principales:
//   - "Soy cliente": genera enlace/QR para su entrenador, ve notas del entrenador
//   - "Soy entrenador": genera enlace/QR para clientes, gestiona ficha de cada cliente
//
// Ficha de cliente (vista del entrenador):
//   - Historial de entrenamientos
//   - Progreso por ejercicio (Performance Score)
//   - Notas del entrenador

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { RoutineDetail } from './RoutinesPage'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

const BASE_URL = 'https://gymtracker-ecru.vercel.app'

// Genera un token hexadecimal de 32 caracteres usando la Web Crypto API
function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Componente raíz ─────────────────────────────────────────────────────────

export default function ConnectionsPage({ user }) {
  const [tab, setTab]           = useState('client') // 'client' | 'trainer'
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading]   = useState(true)

  // Cargar is_trainer al montar para saber qué pestañas mostrar
  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('is_trainer')
        .eq('id', user.id)
        .single()
      setIsTrainer(data?.is_trainer ?? false)
      setLoading(false)
    }
    loadProfile()
  }, [user.id])

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando...</div>
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Conexiones</h2>

      {/* Pestañas: solo se muestran si el usuario es entrenador */}
      {isTrainer && (
        <div className="flex gap-2 mb-6">
          {[
            { id: 'client',  label: 'Soy cliente'    },
            { id: 'trainer', label: 'Soy entrenador' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.id
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Si no es entrenador, solo ve "Soy cliente" sin pestañas */}
      {(!isTrainer || tab === 'client')  && <ClientSection  user={user} />}
      {isTrainer && tab === 'trainer'    && <TrainerSection user={user} />}
    </div>
  )
}

// ─── Sección: el usuario es cliente ──────────────────────────────────────────

function ClientSection({ user }) {
  const [link, setLink]               = useState(null)
  const [generating, setGenerating]   = useState(false)
  const [connections, setConnections] = useState([])  // entrenadores activos
  const [loading, setLoading]         = useState(true)

  useEffect(() => { loadConnections() }, [])

  async function loadConnections() {
    setLoading(true)
    const { data } = await supabase
      .from('trainer_connections')
      .select('id, trainer_id, active, token, type')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      const active  = data.filter(c => c.trainer_id && c.active)
      const pending = data.filter(c => !c.trainer_id)

      const profiles = await fetchProfiles(active.map(c => c.trainer_id))
      setConnections(active.map(c => ({
        ...c,
        trainerName: profiles[c.trainer_id] || 'Sin nombre',
      })))

      if (pending.length > 0) {
        setLink(`${BASE_URL}/connect?token=${pending[0].token}`)
      }
    }
    setLoading(false)
  }

  async function generateLink() {
    setGenerating(true)
    const token = generateToken()
    const { error } = await supabase.from('trainer_connections').insert({
      client_id:  user.id,
      trainer_id: null,
      token,
      active: false,
      type: 'client_invites_trainer',
    })
    if (error) {
      console.error('Error al generar enlace (client):', error)
    } else {
      setLink(`${BASE_URL}/connect?token=${token}`)
    }
    setGenerating(false)
  }

  async function revokeConnection(id) {
    await supabase.from('trainer_connections').update({ active: false }).eq('id', id)
    setConnections(cs => cs.filter(c => c.id !== id))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Panel de generación de enlace */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-semibold mb-1">Invita a tu entrenador</h3>
        <p className="text-sm text-gray-500 mb-4">
          Genera un enlace y compártelo con tu entrenador para que pueda ver tu progreso.
        </p>
        {link ? (
          <LinkDisplay link={link} onNewLink={() => setLink(null)} />
        ) : (
          <button
            onClick={generateLink}
            disabled={generating}
            className="w-full bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {generating ? 'Generando...' : 'Generar enlace para mi entrenador'}
          </button>
        )}
      </div>

      {/* Lista de entrenadores conectados */}
      <div>
        <h3 className="font-semibold mb-3">Mis entrenadores</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-gray-400">Aún no tienes entrenador conectado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connections.map(c => (
              <li key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium">{c.trainerName}</p>
                    <p className="text-xs text-gray-400">Entrenador</p>
                  </div>
                  <button
                    onClick={() => revokeConnection(c.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Revocar
                  </button>
                </div>
                {/* Notas que este entrenador ha dejado para el cliente */}
                <TrainerNotesForClient
                  trainerId={c.trainer_id}
                  clientId={user.id}
                  trainerName={c.trainerName}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Notas del entrenador visibles para el cliente ───────────────────────────

function TrainerNotesForClient({ trainerId, clientId, trainerName }) {
  const [notes, setNotes]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // El cliente lee sus propias notas — la policy RLS permite leer
      // trainer_notes donde client_id = auth.uid()
      const { data } = await supabase
        .from('trainer_notes')
        .select('id, content, created_at')
        .eq('trainer_id', trainerId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setNotes(data || [])
      setLoading(false)
    }
    load()
  }, [trainerId, clientId])

  if (loading) return <p className="text-xs text-gray-400">Cargando notas...</p>
  if (notes.length === 0) return (
    <p className="text-xs text-gray-400 italic">
      {trainerName} aún no ha dejado notas.
    </p>
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-gray-500">Notas de {trainerName}:</p>
      {notes.map(n => (
        <div key={n.id} className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-sm text-gray-700">{n.content}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDate(n.created_at)}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Sección: el usuario es entrenador ───────────────────────────────────────

function TrainerSection({ user }) {
  const [link, setLink]               = useState(null)
  const [generating, setGenerating]   = useState(false)
  const [connections, setConnections] = useState([])
  const [loading, setLoading]         = useState(true)
  // { id, name } del cliente cuya ficha estamos viendo, o null
  const [viewingClient, setViewingClient] = useState(null)

  useEffect(() => { loadConnections() }, [])

  async function loadConnections() {
    setLoading(true)
    const { data } = await supabase
      .from('trainer_connections')
      .select('id, client_id, active, token')
      .eq('trainer_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      const active  = data.filter(c => c.client_id && c.active)
      const pending = data.filter(c => !c.client_id)

      const profiles = await fetchProfiles(active.map(c => c.client_id))
      setConnections(active.map(c => ({
        ...c,
        clientName: profiles[c.client_id] || 'Sin nombre',
      })))

      if (pending.length > 0) {
        setLink(`${BASE_URL}/connect?token=${pending[0].token}`)
      }
    }
    setLoading(false)
  }

  async function generateLink() {
    setGenerating(true)
    const token = generateToken()
    const { error } = await supabase.from('trainer_connections').insert({
      trainer_id: user.id,
      client_id:  null,
      token,
      active: false,
      type: 'trainer_invites_client',
    })
    if (error) {
      console.error('Error al generar enlace (trainer):', error)
    } else {
      setLink(`${BASE_URL}/connect?token=${token}`)
    }
    setGenerating(false)
  }

  // Si el entrenador tiene una ficha abierta, renderizar esa vista
  if (viewingClient) {
    return (
      <ClientDetailView
        client={viewingClient}
        trainer={user}
        onBack={() => setViewingClient(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Panel de generación de enlace */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-semibold mb-1">Añade un cliente</h3>
        <p className="text-sm text-gray-500 mb-4">
          Genera un enlace y compártelo con tu cliente para conectaros.
        </p>
        {link ? (
          <LinkDisplay link={link} onNewLink={() => setLink(null)} />
        ) : (
          <button
            onClick={generateLink}
            disabled={generating}
            className="w-full bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {generating ? 'Generando...' : 'Generar enlace para mi cliente'}
          </button>
        )}
      </div>

      {/* Lista de clientes */}
      <div>
        <h3 className="font-semibold mb-3">Mis clientes</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-gray-400">Aún no tienes clientes conectados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connections.map(c => (
              <li
                key={c.id}
                onClick={() => setViewingClient({ id: c.client_id, name: c.clientName })}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{c.clientName}</p>
                  <p className="text-xs text-gray-400">Cliente</p>
                </div>
                <span className="text-xs text-gray-400">Ver →</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Ficha completa del cliente (vista del entrenador) ───────────────────────
//
// Tres sub-vistas accesibles por pestañas: historial, progreso, notas.
//
// IMPORTANTE — policies RLS necesarias en Supabase para que funcione:
//
//   -- Entrenador puede leer workout_logs del cliente:
//   create policy "trainer reads client logs" on workout_logs
//     using (exists (
//       select 1 from trainer_connections
//       where trainer_id = auth.uid() and client_id = workout_logs.user_id and active = true
//     ));
//
//   -- Entrenador puede leer log_sets del cliente (a través de workout_logs):
//   create policy "trainer reads client log_sets" on log_sets
//     using (exists (
//       select 1 from workout_logs
//       join trainer_connections on trainer_connections.client_id = workout_logs.user_id
//       where log_sets.log_id = workout_logs.id
//         and trainer_connections.trainer_id = auth.uid()
//         and trainer_connections.active = true
//     ));
//
//   -- Entrenador y cliente pueden leer/escribir trainer_notes propias:
//   create policy "trainer notes access" on trainer_notes
//     using (auth.uid() = trainer_id or auth.uid() = client_id)
//     with check (auth.uid() = trainer_id);

function ClientDetailView({ client, trainer, onBack }) {
  const [tab, setTab] = useState('history') // 'history' | 'progress' | 'notes'

  return (
    <div>
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-black text-lg"
          aria-label="Volver"
        >←</button>
        <div>
          <h3 className="font-semibold">{client.name}</h3>
          <p className="text-xs text-gray-400">Cliente</p>
        </div>
      </div>

      {/* Pestañas de la ficha */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {[
          { id: 'history',  label: 'Historial' },
          { id: 'progress', label: 'Progreso'  },
          { id: 'routines', label: 'Rutinas'   },
          { id: 'notes',    label: 'Notas'     },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history'  && <ClientHistory  clientId={client.id} />}
      {tab === 'progress' && <ClientProgress clientId={client.id} />}
      {tab === 'routines' && <ClientRoutines clientId={client.id} trainerId={trainer.id} />}
      {tab === 'notes'    && <ClientNotes    clientId={client.id} trainerId={trainer.id} />}
    </div>
  )
}

// ─── Sub-vista: historial de entrenamientos del cliente ──────────────────────

function ClientHistory({ clientId }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('workout_logs')
        .select('id, logged_date, routines(name), log_sets(exercise_id, reps_done)')
        .eq('user_id', clientId)
        .order('logged_date', { ascending: false })
      setSessions(data || [])
      setLoading(false)
    }
    load()
  }, [clientId])

  if (loading) return <p className="text-sm text-gray-400">Cargando historial...</p>

  if (sessions.length === 0) return (
    <p className="text-sm text-gray-400">
      Sin sesiones registradas — o falta la policy RLS para acceso del entrenador.
    </p>
  )

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map(s => {
        // Contar series completadas (con reps_done registradas)
        const seriesCompletadas = s.log_sets?.filter(ls => ls.reps_done != null).length ?? 0
        const ejerciciosUnicos  = new Set(s.log_sets?.map(ls => ls.exercise_id)).size
        const [y, m, d] = s.logged_date.split('-').map(Number)
        const fecha = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
          weekday: 'short', day: 'numeric', month: 'short',
        })
        return (
          <li key={s.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-sm font-medium">{s.routines?.name || 'Sin rutina'}</p>
            <p className="text-xs text-gray-400">
              {fecha} · {ejerciciosUnicos} ejercicio{ejerciciosUnicos !== 1 ? 's' : ''} · {seriesCompletadas} serie{seriesCompletadas !== 1 ? 's' : ''}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Sub-vista: progreso por ejercicio del cliente ───────────────────────────
//
// Misma lógica que ProgressPage pero filtrando log_sets por el user_id del cliente.
// La query usa workout_logs!inner para asociar cada serie a la fecha de la sesión
// y al user_id del cliente.

function ClientProgress({ clientId }) {
  const [view, setView]         = useState('list')
  const [selected, setSelected] = useState(null)  // { id, name, muscle_group }

  return (
    <div>
      {view === 'list' && (
        <ClientExerciseList
          clientId={clientId}
          onSelect={ex => { setSelected(ex); setView('detail') }}
        />
      )}
      {view === 'detail' && (
        <ClientExerciseDetail
          exercise={selected}
          clientId={clientId}
          onBack={() => setView('list')}
        />
      )}
    </div>
  )
}

// Lista de ejercicios que el cliente ha entrenado
function ClientExerciseList({ clientId, onSelect }) {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      // Traemos log_sets del cliente filtrando por workout_logs.user_id
      const { data } = await supabase
        .from('log_sets')
        .select('exercise_id, exercises(id, name, muscle_group), workout_logs!inner(user_id, completed)')
        .eq('workout_logs.user_id', clientId)
        .eq('workout_logs.completed', true)

      if (!data) { setLoading(false); return }

      // Deduplicar por exercise_id
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
    load()
  }, [clientId])

  if (loading) return <p className="text-sm text-gray-400">Cargando ejercicios...</p>

  if (exercises.length === 0) return (
    <p className="text-sm text-gray-400">
      Sin datos de progreso — o falta la policy RLS para acceso del entrenador.
    </p>
  )

  return (
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
  )
}

// Gráfica de PS para un ejercicio del cliente
function ClientExerciseDetail({ exercise, clientId, onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('log_sets')
        .select('reps_done, weight_done, log_id, workout_logs!inner(logged_date, user_id, completed)')
        .eq('exercise_id', exercise.id)
        .eq('workout_logs.user_id', clientId)
        .eq('workout_logs.completed', true)

      if (!data) { setLoading(false); return }

      // Calcular PS por sesión — misma lógica que ProgressPage
      const sessionMap = {}
      for (const s of data) {
        if (!sessionMap[s.log_id]) {
          sessionMap[s.log_id] = { date: s.workout_logs.logged_date, sets: [] }
        }
        sessionMap[s.log_id].sets.push(s)
      }

      const result = Object.values(sessionMap)
        .map(({ date, sets }) => {
          const valid = sets.filter(s => s.reps_done != null && s.weight_done != null && s.weight_done > 0)
          if (valid.length === 0) return null

          const pesoMax    = Math.max(...valid.map(s => s.weight_done))
          const mejorSerie = valid.reduce((best, s) => s.weight_done > best.weight_done ? s : best)
          const volumen    = valid.reduce((sum, s) => sum + s.reps_done * s.weight_done, 0)
          const ps         = (pesoMax * mejorSerie.reps_done) + (volumen * 0.1)

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
    load()
  }, [exercise.id, clientId])

  if (loading) return <p className="text-sm text-gray-400 py-4">Cargando progreso...</p>

  return (
    <div className="pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-black text-lg">←</button>
        <div>
          <p className="font-semibold">{exercise.name}</p>
          {exercise.muscle_group && <p className="text-xs text-gray-400">{exercise.muscle_group}</p>}
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
          {/* Gráfica de PS */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Performance Score</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={sessions} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v) => [v, 'PS']}
                  labelStyle={{ fontSize: 11 }}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="ps" stroke="#111" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla de sesiones */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-right px-4 py-2">Peso máx</th>
                  <th className="text-right px-4 py-2">Volumen</th>
                  <th className="text-right px-4 py-2 font-bold text-gray-700">PS</th>
                </tr>
              </thead>
              <tbody>
                {[...sessions].reverse().map((s, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-600">{s.dateLabel}</td>
                    <td className="px-4 py-2 text-right">{s.pesoMax} kg</td>
                    <td className="px-4 py-2 text-right">{s.volumen} kg</td>
                    <td className="px-4 py-2 text-right font-semibold">{s.ps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-vista: rutinas asignadas al cliente ─────────────────────────────────
//
// Muestra las rutinas donde assigned_to = clientId.
// El entrenador también puede crear una rutina nueva directamente para el cliente.
//
// RLS necesaria para que el entrenador pueda insertar rutinas para el cliente:
//   create policy "trainer inserts client routines" on routines
//     for insert with check (
//       assigned_to is not null and exists (
//         select 1 from trainer_connections
//         where trainer_id = auth.uid() and client_id = assigned_to and active = true
//       )
//     );
//
//   create policy "trainer reads client routines" on routines
//     for select using (
//       user_id = auth.uid() or assigned_to = auth.uid() or exists (
//         select 1 from trainer_connections
//         where trainer_id = auth.uid() and client_id = routines.user_id and active = true
//       )
//     );

// Muestra rutinas propias del cliente y las asignadas por el entrenador.
// El entrenador puede editar cualquiera usando RoutineDetail y crear nuevas.
function ClientRoutines({ clientId }) {
  const [assigned, setAssigned] = useState([])  // assigned_to = clientId
  const [own, setOwn]           = useState([])  // user_id = clientId (sin assigned_to)
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [saving, setSaving]     = useState(false)
  // Rutina que se está editando con RoutineDetail (o null)
  const [editing, setEditing]   = useState(null)

  useEffect(() => { loadRoutines() }, []) // eslint-disable-line

  async function loadRoutines() {
    setLoading(true)

    // Rutinas asignadas explícitamente al cliente por el entrenador
    const { data: asgn, error: e1 } = await supabase
      .from('routines')
      .select('id, name, order, created_at')
      .eq('assigned_to', clientId)
      .order('created_at', { ascending: false })
    if (e1) console.error('Error cargando rutinas asignadas:', e1)

    // Rutinas propias del cliente (creadas por él mismo, sin assigned_to)
    const { data: ownData, error: e2 } = await supabase
      .from('routines')
      .select('id, name, order, created_at')
      .eq('user_id', clientId)
      .is('assigned_to', null)
      .neq('is_template', true)
      .order('order')
    if (e2) console.error('Error cargando rutinas propias del cliente:', e2)

    setAssigned(asgn || [])
    setOwn(ownData || [])
    setLoading(false)
  }

  // Si estamos editando una rutina, mostrar RoutineDetail a pantalla completa
  if (editing) {
    return (
      <RoutineDetail
        routine={editing}
        onBack={() => { setEditing(null); loadRoutines() }}
      />
    )
  }

  // Crea una rutina vacía directamente para el cliente
  async function createRoutine(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('routines').insert({
      name:        newName.trim(),
      user_id:     clientId,
      assigned_to: clientId,
      is_template: false,
    })
    if (error) {
      console.error('Error al crear rutina para cliente:', error)
    } else {
      setNewName('')
      setCreating(false)
      loadRoutines()
    }
    setSaving(false)
  }

  async function deleteRoutine(id) {
    await supabase.from('routines').delete().eq('id', id)
    setAssigned(rs => rs.filter(r => r.id !== id))
    setOwn(rs => rs.filter(r => r.id !== id))
  }

  if (loading) return <p className="text-sm text-gray-400">Cargando rutinas...</p>

  const noContent = assigned.length === 0 && own.length === 0

  return (
    <div className="flex flex-col gap-3">
      {noContent && !creating && (
        <p className="text-sm text-gray-400">Este cliente aún no tiene rutinas.</p>
      )}

      {/* Rutinas asignadas por el entrenador */}
      {assigned.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 mt-1">Asignadas por entrenador</p>
          {assigned.map(r => (
            <RoutineRow key={r.id} r={r} onEdit={() => setEditing(r)} onDelete={() => deleteRoutine(r.id)} />
          ))}
        </>
      )}

      {/* Rutinas propias del cliente */}
      {own.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 mt-1">Propias del cliente</p>
          {own.map(r => (
            <RoutineRow key={r.id} r={r} onEdit={() => setEditing(r)} onDelete={() => deleteRoutine(r.id)} />
          ))}
        </>
      )}

      {/* Formulario nueva rutina */}
      {creating ? (
        <form onSubmit={createRoutine} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Nombre de la rutina"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
            required
            autoFocus
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : 'Crear rutina'}
            </button>
            <button type="button" onClick={() => setCreating(false)}
              className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full border border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-400 hover:text-black hover:border-gray-400 transition-colors"
        >
          + Crear rutina para este cliente
        </button>
      )}
    </div>
  )
}

// Fila de rutina con botones Editar y Eliminar
function RoutineRow({ r, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    onDelete()
  }

  return (
    <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onEdit} className="flex-1 text-left px-4 py-3">
        <p className="text-sm font-medium">{r.name}</p>
      </button>
      <button onClick={onEdit}
        className="text-xs px-3 py-3 text-gray-400 hover:text-black transition-colors border-l border-gray-100">
        Editar
      </button>
      <button onClick={handleDelete}
        className={`text-xs px-3 py-3 transition-colors border-l border-gray-100 ${
          confirmDelete ? 'text-red-500 font-semibold' : 'text-gray-300 hover:text-red-500'
        }`}>
        {confirmDelete ? '¿Eliminar?' : '×'}
      </button>
    </div>
  )
}

// ─── Sub-vista: notas del entrenador sobre el cliente ────────────────────────

function ClientNotes({ clientId, trainerId }) {
  const [notes, setNotes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    const { data } = await supabase
      .from('trainer_notes')
      .select('id, content, created_at')
      .eq('trainer_id', trainerId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setNotes(data || [])
    setLoading(false)
  }

  // Guarda una nota nueva y actualiza la lista localmente
  async function saveNote(e) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSaving(true)

    const { data, error } = await supabase
      .from('trainer_notes')
      .insert({ trainer_id: trainerId, client_id: clientId, content: newNote.trim() })
      .select('id, content, created_at')
      .single()

    if (!error && data) {
      setNotes(prev => [data, ...prev])
      setNewNote('')
    }
    setSaving(false)
  }

  async function deleteNote(id) {
    await supabase.from('trainer_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Formulario nueva nota */}
      <form onSubmit={saveNote} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
        <label className="text-xs font-medium text-gray-500">Nueva nota</label>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Escribe una nota para este cliente..."
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400 resize-none"
        />
        <button
          type="submit"
          disabled={saving || !newNote.trim()}
          className="bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Guardando...' : 'Guardar nota'}
        </button>
      </form>

      {/* Lista de notas anteriores */}
      {loading ? (
        <p className="text-sm text-gray-400">Cargando notas...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Aún no hay notas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map(n => (
            <li key={n.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">{formatDate(n.created_at)}</p>
                <button
                  onClick={() => deleteNote(n.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Componente compartido: QR + enlace copiable ─────────────────────────────

function LinkDisplay({ link, onNewLink }) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="p-3 bg-white border border-gray-200 rounded-xl">
        <QRCodeSVG value={link} size={180} />
      </div>
      <div className="w-full">
        <p className="text-xs text-gray-500 break-all bg-gray-50 rounded-lg p-3 font-mono mb-2">
          {link}
        </p>
        <button
          onClick={copyLink}
          className="w-full border border-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          {copied ? '¡Copiado!' : 'Copiar enlace'}
        </button>
      </div>
      <button onClick={onNewLink} className="text-xs text-gray-400 hover:text-gray-600">
        Generar nuevo enlace
      </button>
    </div>
  )
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

// Obtiene name de varios usuarios por sus IDs → { id: name }
async function fetchProfiles(ids) {
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', ids)
  console.log('profiles resultado:', data, 'error:', error)
  const map = {}
  data?.forEach(p => { map[p.id] = p.name })
  return map
}

// Formatea una fecha ISO (o timestamptz) a "lun 7 abr"
function formatDate(dateStr) {
  // Las fechas de workout_logs son DATE (YYYY-MM-DD) — parsear como local
  // Las fechas de trainer_notes son TIMESTAMPTZ — parsear directamente
  const d = dateStr.includes('T') ? new Date(dateStr) : (() => {
    const [y, m, day] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, day)
  })()
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
