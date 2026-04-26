import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NotesPage({ user, onVisit }) {
  const [notes, setNotes]     = useState([])
  const [trainers, setTrainers] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    localStorage.setItem('notesLastVisited', new Date().toISOString())
    onVisit?.()
    loadNotes()
  }, [])

  async function loadNotes() {
    const { data } = await supabase
      .from('trainer_notes')
      .select('id, content, created_at, trainer_id')
      .eq('client_id', user.id)
      .eq('is_private', false)
      .order('created_at', { ascending: false })

    if (!data?.length) {
      setLoading(false)
      return
    }

    const trainerIds = [...new Set(data.map(n => n.trainer_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', trainerIds)

    const trainerMap = {}
    profiles?.forEach(p => {
      trainerMap[p.id] = p.display_name || p.email || 'Entrenador'
    })

    setNotes(data)
    setTrainers(trainerMap)
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando notas...</div>
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Notas de tu entrenador</h1>

      {notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Tu entrenador aún no ha compartido notas contigo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map(n => (
            <li key={n.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">{formatDate(n.created_at)}</p>
                {trainers[n.trainer_id] && (
                  <p className="text-xs text-gray-400">{trainers[n.trainer_id]}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
