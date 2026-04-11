// Página de perfil del usuario.
//
// Muestra nombre, email y el toggle "Modo entrenador" (campo is_trainer en profiles).
// También contiene el botón de cerrar sesión (se quitó de la barra de nav).

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ProfilePage({ user, onSignOut }) {
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  // Cargar el perfil al montar para leer is_trainer
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

  // Actualiza is_trainer en BD y en el estado local
  async function toggleTrainerMode(value) {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ is_trainer: value })
      .eq('id', user.id)
    setIsTrainer(value)
    setSaving(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando perfil...</div>
  }

  // Nombre: puede venir de user_metadata (Google OAuth) o de la columna display_name
  const displayName = user.user_metadata?.display_name
    || user.user_metadata?.full_name
    || user.email

  return (
    <div className="p-4 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-6">Perfil</h1>

      {/* Datos del usuario */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-lg shrink-0">
            {displayName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-base truncate">{displayName}</p>
            <p className="text-sm text-gray-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* Toggle modo entrenador */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium">Modo entrenador</p>
            <p className="text-xs text-gray-400">
              {isTrainer
                ? 'Puedes gestionar clientes en Conexiones'
                : 'Actívalo para gestionar clientes'}
            </p>
          </div>
          <button
            onClick={() => toggleTrainerMode(!isTrainer)}
            disabled={saving}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              isTrainer ? 'bg-gray-900' : 'bg-gray-300'
            }`}
            aria-label="Toggle modo entrenador"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                isTrainer ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Botón cerrar sesión */}
      <button
        onClick={onSignOut}
        className="w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 hover:text-black hover:border-gray-400 transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
