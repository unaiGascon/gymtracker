// Pantalla de registro
//
// Crea una cuenta nueva con email+contraseña o con Google OAuth.
// El nombre se guarda en auth.user.user_metadata.display_name
// (y opcionalmente en la tabla profiles si se quiere acceder desde SQL).

import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Props:
//   onGoToLogin — navega a LoginPage
export default function RegisterPage({ onGoToLogin }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [done, setDone]         = useState(false) // true = registro OK, esperando confirmación

  // Registro con email y contraseña
  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim() },  // guardado en auth.user.user_metadata
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Supabase envía un email de confirmación por defecto.
      // Si el proyecto tiene "Confirm email" desactivado, la sesión
      // se abre sola y onAuthStateChange en App.jsx lo detecta.
      setDone(true)
      setLoading(false)
    }
  }

  // Registro con Google — redirige a Google y vuelve a la app automáticamente
  async function handleGoogle() {
    setError(null)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  // Si el registro se hizo con email, mostrar mensaje de confirmación
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-bold mb-2">Confirma tu email</h2>
          <p className="text-sm text-gray-500 mb-6">
            Te hemos enviado un enlace de confirmación a <strong>{email}</strong>.
            Ábrelo para activar tu cuenta.
          </p>
          <button onClick={onGoToLogin} className="text-sm text-gray-500 underline">
            Volver a inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1 text-center">GymTracker</h1>
        <p className="text-sm text-gray-400 mb-8 text-center">Crea tu cuenta</p>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tu nombre"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {/* Mensaje de error */}
          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Registrando...' : 'Crear cuenta'}
          </button>

          {/* Separador */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Registrarse con Google
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes cuenta?{' '}
          <button onClick={onGoToLogin} className="font-medium text-gray-900 underline">
            Inicia sesión
          </button>
        </p>
      </div>
    </div>
  )
}
