// Página de perfil del usuario.
//
// Muestra nombre, email, el toggle "Modo entrenador" (campo is_trainer en profiles)
// y la configuración del temporizador de descanso (campo rest_seconds en profiles).
// También contiene el botón de cerrar sesión (se quitó de la barra de nav).

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Opciones rápidas de descanso (0 = desactivado)
const REST_PRESETS = [0, 60, 90, 120, 180]

export default function ProfilePage({ user, onSignOut }) {
  const [isTrainer, setIsTrainer]   = useState(false)
  const [restSeconds, setRestSeconds] = useState(90)   // tiempo de descanso en segundos
  const [customRest, setCustomRest]   = useState('')   // input de valor personalizado
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [savingRest, setSavingRest]   = useState(false)

  // Cargar el perfil al montar para leer is_trainer y rest_seconds
  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('is_trainer, rest_seconds')
        .eq('id', user.id)
        .single()
      setIsTrainer(data?.is_trainer ?? false)
      setRestSeconds(data?.rest_seconds ?? 90)
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

  // Guarda rest_seconds en BD y actualiza el estado local
  async function saveRestSeconds(value) {
    setSavingRest(true)
    await supabase
      .from('profiles')
      .update({ rest_seconds: value })
      .eq('id', user.id)
    setRestSeconds(value)
    setCustomRest('')
    setSavingRest(false)
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

      {/* Datos del usuario + toggle modo entrenador */}
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

      {/* Configuración del temporizador de descanso */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <p className="text-sm font-medium mb-0.5">Descanso entre series</p>
        <p className="text-xs text-gray-400 mb-4">
          Se activa al completar una serie (0 = desactivado)
        </p>

        {/* Pills con opciones rápidas */}
        <div className="flex gap-2 flex-wrap mb-3">
          {REST_PRESETS.map(s => (
            <button
              key={s}
              onClick={() => saveRestSeconds(s)}
              disabled={savingRest}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                restSeconds === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {s === 0 ? 'Off' : `${s}s`}
            </button>
          ))}
        </div>

        {/* Input personalizado */}
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Otro valor (seg)"
            value={customRest}
            min="0"
            onChange={e => setCustomRest(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            onClick={() => { if (customRest !== '') saveRestSeconds(parseInt(customRest)) }}
            disabled={customRest === '' || savingRest}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {savingRest ? '...' : 'Guardar'}
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
