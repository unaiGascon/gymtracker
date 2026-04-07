// Página de gestión de conexiones entrenador-cliente.
//
// Dos pestañas:
//   - "Soy cliente": genera un enlace/QR para que un entrenador lo escanee
//   - "Soy entrenador": genera un enlace/QR para que un cliente lo escanee
//
// Flujo completo:
//   1. El usuario genera un registro en trainer_connections con token único
//   2. Comparte el enlace / QR con la otra parte
//   3. La otra parte abre /connect?token=TOKEN y acepta (AcceptConnectionPage)
//   4. La conexión queda active=true con ambos IDs rellenos

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'

const BASE_URL = 'https://gymtracker-ecru.vercel.app'

// Genera un token hexadecimal de 32 caracteres usando la Web Crypto API
function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Componente raíz ─────────────────────────────────────────────────────────

export default function ConnectionsPage({ user }) {
  const [tab, setTab] = useState('client') // 'client' | 'trainer'

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Conexiones</h2>

      {/* Pestañas principales */}
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

      {tab === 'client'  && <ClientSection  user={user} />}
      {tab === 'trainer' && <TrainerSection user={user} />}
    </div>
  )
}

// ─── Sección: el usuario es cliente y busca entrenador ───────────────────────

function ClientSection({ user }) {
  const [link, setLink]             = useState(null)   // enlace pendiente visible
  const [generating, setGenerating] = useState(false)
  const [connections, setConnections] = useState([])   // entrenadores activos
  const [loading, setLoading]       = useState(true)

  useEffect(() => { loadConnections() }, [])

  // Carga conexiones donde este usuario es el cliente
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

      // Obtener nombres de los entrenadores conectados
      const ids = active.map(c => c.trainer_id)
      const profiles = await fetchProfiles(ids)
      setConnections(active.map(c => ({
        ...c,
        trainerName: profiles[c.trainer_id] || 'Sin nombre',
      })))

      // Si ya existe un enlace sin aceptar, mostrarlo en lugar de generar otro
      if (pending.length > 0) {
        setLink(`${BASE_URL}/connect?token=${pending[0].token}`)
      }
    }
    setLoading(false)
  }

  // Crea un nuevo registro en BD y muestra el enlace resultante
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
    if (!error) setLink(`${BASE_URL}/connect?token=${token}`)
    setGenerating(false)
  }

  // Marca la conexión como inactiva (revocar)
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
              <li key={c.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Sección: el usuario es entrenador y añade clientes ──────────────────────

function TrainerSection({ user }) {
  const [link, setLink]             = useState(null)
  const [generating, setGenerating] = useState(false)
  const [connections, setConnections] = useState([])
  const [loading, setLoading]       = useState(true)
  const [viewingClient, setViewingClient] = useState(null) // { id, name }

  useEffect(() => { loadConnections() }, [])

  // Carga conexiones donde este usuario es el entrenador
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

      const ids = active.map(c => c.client_id)
      const profiles = await fetchProfiles(ids)
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
    if (!error) setLink(`${BASE_URL}/connect?token=${token}`)
    setGenerating(false)
  }

  // Si el entrenador hace clic en un cliente, mostrar su historial
  if (viewingClient) {
    return <ClientDetailView client={viewingClient} onBack={() => setViewingClient(null)} />
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

// ─── Vista de historial de un cliente (vista del entrenador) ─────────────────
//
// NOTA: Para que esto funcione, hay que añadir en Supabase una policy RLS que
// permita al entrenador leer los workout_logs de su cliente:
//
//   create policy "trainer can read client logs" on workout_logs
//     using (exists (
//       select 1 from trainer_connections
//       where trainer_id = auth.uid()
//         and client_id = workout_logs.user_id
//         and active = true
//     ));
//
// Sin esa policy, la query devuelve vacío (RLS bloquea el acceso).

function ClientDetailView({ client, onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('workout_logs')
        .select('id, logged_date, routines(name), log_sets(exercise_id)')
        .eq('user_id', client.id)
        .order('logged_date', { ascending: false })
      setSessions(data || [])
      setLoading(false)
    }
    load()
  }, [client.id])

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 mb-4 hover:text-black"
      >
        ← Volver
      </button>
      <h3 className="font-semibold mb-4">Historial de {client.name}</h3>

      {loading ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400">
          Sin sesiones — o falta la policy RLS para acceso de entrenador.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map(s => {
            const ejercicios = new Set(s.log_sets?.map(ls => ls.exercise_id)).size
            // Parsear como fecha local (evita desfase de zona horaria)
            const [y, m, d] = s.logged_date.split('-').map(Number)
            const fecha = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
              weekday: 'short', day: 'numeric', month: 'short',
            })
            return (
              <li key={s.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-sm font-medium">{s.routines?.name || 'Sin rutina'}</p>
                <p className="text-xs text-gray-400">
                  {fecha} · {ejercicios} ejercicio{ejercicios !== 1 ? 's' : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Componente compartido: muestra el enlace con QR y botón copiar ──────────

function LinkDisplay({ link, onNewLink }) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR code */}
      <div className="p-3 bg-white border border-gray-200 rounded-xl">
        <QRCodeSVG value={link} size={180} />
      </div>

      {/* Enlace copiable */}
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

      <button
        onClick={onNewLink}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Generar nuevo enlace
      </button>
    </div>
  )
}

// ─── Utilidad: obtiene display_name de varios usuarios por sus IDs ───────────

async function fetchProfiles(ids) {
  if (!ids.length) return {}
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)
  const map = {}
  data?.forEach(p => { map[p.id] = p.display_name })
  return map
}
