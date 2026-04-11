# GymTracker — Contexto del proyecto

> Pega este archivo al inicio de cada sesión con Claude Code o Claude.ai para retomar donde lo dejaste.

---

## Filosofía de desarrollo

- Código simple y legible por encima de todo
- Comentarios en cada función explicando qué hace y por qué
- Sin abstracciones innecesarias — mejor repetir 2 líneas que crear una capa extra
- Avanzar por versiones: v1 mínima funcional, luego mejoras incrementales

---

## Versión actual: v5 — perfil de usuario y modo entrenador

Las conexiones entrenador-cliente están completamente implementadas y funcionando en producción.
El siguiente paso es la Fase 4: funcionalidades del entrenador.

**La app está desplegada en Vercel y funciona en producción.**

---

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | React 19 + Vite 8 | `npm run dev` → localhost:5173 |
| Estilos | Tailwind CSS v4 | Plugin `@tailwindcss/vite` (NO postcss). `@import "tailwindcss"` en index.css |
| Base de datos | Supabase (PostgreSQL) | Actúa de BD y API — sin backend propio |
| Gráficas | recharts | Instalado como dependencia |
| Ejecución | Vercel (producción) + localhost (desarrollo) | Deploy automático desde la rama main |

**Credenciales Supabase** en `.env` para desarrollo local (en `.gitignore`, nunca subir).
En producción las mismas variables están configuradas en Vercel → Settings → Environment Variables:
```
VITE_SUPABASE_URL=https://tagzwyoigooccmprpvdy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Cliente Supabase exportado desde `src/lib/supabase.js`.

---

## Esquema de base de datos

### `profiles`
Perfil de cada usuario autenticado (creado automáticamente al registrarse).
```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  name text,
  is_trainer boolean default false,  -- activa la sección "Soy entrenador" en Conexiones
  created_at timestamptz default now()
);
```

### `admins`
Usuarios con rol de administrador.
```sql
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
```

### `trainer_connections`
Relación entre un entrenador y su cliente.
```sql
create table trainer_connections (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references auth.users(id) on delete cascade,
  client_id  uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
```

### `trainer_notes`
Notas del entrenador sobre un cliente.
```sql
create table trainer_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references auth.users(id) on delete cascade,
  client_id  uuid references auth.users(id) on delete cascade,
  content    text,
  created_at timestamptz default now()
);
```

### `exercises`
Catálogo de ejercicios. Gestionable desde la app (pantalla Rutinas → Ejercicios).
```sql
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text,
  description text,
  created_by uuid references auth.users(id)  -- null = ejercicio del sistema; uuid = creado por ese usuario
);
```

### `routines`
Las rutinas disponibles. Tienen un campo `order` para el ciclo semanal.
```sql
create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  "order" int,          -- orden en el ciclo (1, 2, 3...)
  created_at timestamptz default now()
);
```

### `routine_exercises`
Qué ejercicios tiene cada rutina, en qué bloque y en qué orden.
```sql
create table routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid references routines(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  block text not null,    -- 'warmup' | 'main' | 'cardio' | 'cooldown'
  sets int,
  reps int,
  weight_kg float,
  duration_min int,       -- para ejercicios por tiempo (cardio, movilidad...)
  "order" int,
  superset_group text     -- nullable: mismo valor = superserie
);
```

### `workout_logs`
Registro de cada sesión completada.
```sql
create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  routine_id uuid references routines(id),
  logged_date date default current_date,
  notes text,
  completed boolean default true  -- siempre true; los borradores van en localStorage
);
```

### `log_sets`
Series reales registradas en cada sesión.
```sql
create table log_sets (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references workout_logs(id) on delete cascade,
  exercise_id uuid references exercises(id),
  set_number int,
  reps_done int,
  weight_done float
);
```

---

## Bloques de una rutina

| Bloque | Valor | Color UI |
|---|---|---|
| Calentamiento | `warmup` | Naranja |
| Bloque principal | `main` | Negro |
| Cardio | `cardio` | Verde |
| Vuelta a la calma | `cooldown` | Morado |

Ejercicios con `duration_min` muestran solo "X min" (sin inputs de series).
Ejercicios con `sets`+`reps` muestran inputs de reps y peso.

---

## Estructura de archivos

```
src/
  lib/
    supabase.js                — cliente Supabase (importar en páginas)
  pages/
    HomePage.jsx               — pantalla de inicio, elige rutina
    WorkoutPage.jsx            — entrenamiento activo
    HistoryPage.jsx            — historial de sesiones
    RoutinesPage.jsx           — gestión de rutinas y catálogo de ejercicios
    ProgressPage.jsx           — progreso por ejercicio (gráfica PS + tabla)
    LoginPage.jsx              — email/contraseña + Google OAuth
    RegisterPage.jsx           — nombre, email, contraseña + Google OAuth
    ConnectionsPage.jsx        — gestión de conexiones entrenador-cliente
    AcceptConnectionPage.jsx   — página pública /connect?token=... para aceptar invitaciones
    ProfilePage.jsx            — perfil del usuario: nombre, email, toggle is_trainer, cerrar sesión
  App.jsx                      — navegación principal + detección de ruta /connect
  index.css                    — solo @import "tailwindcss"
  main.jsx                     — punto de entrada
vercel.json                    — rewrite /* → /index.html para SPA routing
```

---

## Flujo de navegación

```
/connect?token=...  →  AcceptConnectionPage (pública, sin sesión requerida)

HomePage
  └─→ WorkoutPage (recibe routineId + routineName como props)
        └─→ (fin) → HistoryPage
        └─→ (atrás) → HomePage

Barra nav superior: [Inicio] [Historial] [Rutinas] [Progreso] [Conexiones] [Perfil]
  (la barra se oculta durante un entrenamiento activo; scrollable en móvil)
  (el botón "Salir" se quitó de la nav — ahora está dentro de ProfilePage)
```

`App.jsx` gestiona el estado de navegación: `page` ('home' | 'workout' | 'history' | 'routines' | 'progress' | 'connections' | 'profile'), `routineId`, `routineName`.
Detecta `/connect?token=...` via `URLSearchParams` antes de evaluar la sesión.

---

## Pantallas implementadas

### HomePage (`src/pages/HomePage.jsx`)
- Carga rutinas de Supabase ordenadas por `routines.order`
- Determina qué rutina toca hoy: busca el último `workout_log`, toma la rutina siguiente en el ciclo (wrap-around). Sin historial → la primera.
- Resalta la rutina del día con fondo negro + badge "Hoy"
- Todas las rutinas son clicables para elegir cualquiera

### WorkoutPage (`src/pages/WorkoutPage.jsx`)
- Recibe `routineId` y `routineName` como props
- Carga `routine_exercises` con `exercises(*)` ordenados por `order`
- Ejercicios con `duration_min`: muestra "X min", sin inputs
- Ejercicios con `sets`+`reps`: inputs de reps y peso por serie
- **Borrador en localStorage** (clave `workout_draft_{routineId}`):
  - Cada cambio de input persiste el estado completo
  - Al montar, si existe borrador se carga en los inputs con etiqueta "Retomando sesión guardada"
  - Al finalizar, se guarda en Supabase y se elimina el borrador
- Columna "Anterior": series del último `workout_log` completado para ese ejercicio (verde + ↑ si supera)
- Superseries: barra lateral morada 4px, etiqueta "SUPERSERIE"
- Ejercicios completados (todos los inputs rellenos): `opacity-40`
- Botón "Finalizar entrenamiento" fijo abajo: abre modal de confirmación
- **Modal de confirmación** (`ConfirmFinishModal`): muestra ejercicios completados y series registradas; "Sí, finalizar" guarda, "Cancelar" vuelve al entrenamiento
- Pantalla de confirmación tras guardar con "Volver al inicio" y "Ver historial"

### HistoryPage (`src/pages/HistoryPage.jsx`)
- Lista de `workout_logs` con `routines(name)` y conteo de ejercicios únicos, ordenados por fecha desc
- Fecha formateada como "mié 15 ene" (parseada como fecha local, sin desfase de zona horaria)
- Clic en sesión → detalle con `log_sets` + `exercises(name, muscle_group)`, agrupados por ejercicio
- Botón `←` para volver al inicio

### RoutinesPage (`src/pages/RoutinesPage.jsx`)
Dos secciones con pestañas internas ("Rutinas" / "Ejercicios"):

**Sección Rutinas — lista (`RoutineList`):**
- Clic en nombre de rutina → expande panel con "Ver ejercicios" / "Editar"
- "Ver ejercicios" → entra al detalle de la rutina
- "Editar" → formulario inline para cambiar nombre y orden en el ciclo
- Botones ↑↓ para reordenar intercambiando el campo `order` con la adyacente
- Botón × con doble confirmación para eliminar
- Formulario al pie para crear rutina nueva (nombre + orden)

**Sección Rutinas — detalle (`RoutineDetail`):**
- Ejercicios agrupados por bloque con configuración resumida
- Botones ↑↓ para reordenar dentro del bloque
- Botón "Editar" por ejercicio → formulario inline (sets/reps/peso o duration_min)
- Botón × para eliminar ejercicio
- Botón "Unir / Separar superserie" entre ejercicios consecutivos del mismo bloque
- Formulario "Añadir ejercicio": filtro por músculo, selector de ejercicio, bloque, sets/reps/peso o duration_min

**Sección Ejercicios (`ExerciseList`):**
- Lista del catálogo con nombre, grupo muscular y descripción
- Ejercicios propios (`created_by = user.id`): fondo morado suave + badge "Mío"
- Ejercicios del sistema (`created_by = null`): fondo blanco + badge "Sistema"
- Filtro pills "Todos" / "Solo míos" sobre la lista
- Botones Editar/Eliminar solo visibles en ejercicios propios
- Eliminar con doble confirmación (primer clic → "¿Eliminar?", segundo → borra)
- Crear ejercicio: nombre, grupo muscular (select con 9 opciones), descripción opcional; guarda `created_by = user.id`
- Editar ejercicio existente (mismos campos, sin cambiar `created_by`)

**Catálogo en RoutineDetail (al añadir ejercicio):**
- Filtro por grupo muscular (select)
- Toggle pills "Todos" / "Solo míos" que filtra por `created_by = user.id`

### ProgressPage (`src/pages/ProgressPage.jsx`)
- Lista de ejercicios que el usuario ha entrenado al menos una vez (de `log_sets`, no del catálogo)
- Clic en ejercicio → vista de detalle con gráfica y tabla
- **Performance Score (PS)** por sesión:
  - `peso_max` = máximo `weight_done` de esa sesión
  - `mejor_serie_reps` = `reps_done` de la serie con mayor peso
  - `volumen_total` = Σ(`reps_done` × `weight_done`) de todas las series
  - `PS = (peso_max × mejor_serie_reps) + (volumen_total × 0.1)`
- Gráfica de línea (recharts): eje X con fechas, eje Y con PS, tooltip al pasar por punto
- Tabla debajo con sesiones en orden descendente: fecha, peso máx, volumen, PS
- Requiere mínimo 2 sesiones para mostrar la gráfica

### ConnectionsPage (`src/pages/ConnectionsPage.jsx`)
Carga `is_trainer` del perfil al montar:
- `is_trainer = false` → muestra solo "Soy cliente" sin pestañas
- `is_trainer = true` → muestra pestañas "Soy cliente" / "Soy entrenador"

**Soy cliente:**
- Genera token `client_invites_trainer` en `trainer_connections`
- Muestra QR + enlace copiable (`https://gymtracker-ecru.vercel.app/connect?token=...`)
- Si ya existe un enlace pendiente sin aceptar, lo reutiliza
- Lista de entrenadores conectados (`active=true`) con opción de revocar

**Soy entrenador** (solo visible si `is_trainer = true`):
- Genera token `trainer_invites_client` en `trainer_connections`
- Misma lógica de QR/enlace
- Lista de clientes conectados; clic en cliente → vista de historial del cliente
- La vista de historial requiere policy RLS adicional (ver sección RLS)

### ProfilePage (`src/pages/ProfilePage.jsx`)
- Avatar con inicial del nombre, nombre completo y email
- Toggle de interruptor para "Modo entrenador" — lee y escribe `profiles.is_trainer`
- Botón "Cerrar sesión" (antes estaba en la barra de nav)

### AcceptConnectionPage (`src/pages/AcceptConnectionPage.jsx`)
Página pública en `/connect?token=TOKEN`. Gestiona su propia sesión internamente.
- Sin token válido → "Enlace no válido"
- Con `client_id` y `trainer_id` ya rellenos → "Enlace ya usado"
- Sin sesión → formulario inline login/registro con Google OAuth (redirectTo preserva el token)
- Con sesión → muestra quién invita, botón "Aceptar" rellena el campo vacío y pone `active=true`

---

## Decisiones de diseño tomadas

- Navegación sin react-router: estado `page` en `App.jsx`; excepción: `/connect` detectado con `URLSearchParams`
- Navegación interna en `RoutinesPage` y `ConnectionsPage` con estado `view`/`tab` local
- `WorkoutPage` no tiene pestaña en la nav — se entra siempre desde `HomePage`
- La barra de nav se oculta durante el entrenamiento para no distraer; es `overflow-x-auto` para móvil
- Grupos musculares disponibles: Pecho, Espalda, Piernas, Hombros, Bíceps, Tríceps, Cardio, Movilidad, Flexibilidad
- Borradores de entrenamiento en `localStorage`, no en Supabase — `workout_logs.completed` siempre es `true`
- Los inputs de series no usan placeholder con el valor anterior (evita confusión visual); el dato anterior va solo en la columna "Anterior"
- Tokens de conexión: hex de 32 caracteres generado con `crypto.getRandomValues` en el cliente

---

## Supabase — RLS (Row Level Security)

RLS está **activado** en todas las tablas con políticas basadas en `auth.uid()`.

```sql
-- Patrón general para tablas con user_id:
create policy "own data" on exercises
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- routine_exercises y log_sets: acceso a través de la tabla padre
create policy "own data" on routine_exercises
  using (exists (
    select 1 from routines where id = routine_exercises.routine_id
    and user_id = auth.uid()
  ));

-- trainer_connections: trainer y cliente pueden leer, solo el trainer crea
create policy "trainer or client read" on trainer_connections
  using (auth.uid() = trainer_id or auth.uid() = client_id);

-- Para que el entrenador pueda leer workout_logs de su cliente (pendiente de aplicar):
create policy "trainer can read client logs" on workout_logs
  using (exists (
    select 1 from trainer_connections
    where trainer_id = auth.uid()
      and client_id = workout_logs.user_id
      and active = true
  ));
```

> La tabla `exercises` es por usuario (`user_id`), con RLS activo. Cada usuario ve y gestiona solo sus propios ejercicios.

---

## Estado actual

- [x] Proyecto React + Vite + Tailwind v4 inicializado
- [x] Cliente Supabase instalado y configurado
- [x] Proyecto Supabase creado con credenciales en `.env`
- [x] Tablas originales creadas (`exercises`, `routines`, `routine_exercises`, `workout_logs`, `log_sets`)
- [x] Tablas de v2 creadas (`profiles`, `admins`, `trainer_connections`, `trainer_notes`)
- [x] `user_id` añadido a `exercises`, `routines`, `workout_logs`
- [x] RLS activado con políticas basadas en `auth.uid()`
- [x] `HomePage` — selección de rutina con "Hoy" automático
- [x] `WorkoutPage` — registro de series con borrador en localStorage
- [x] `HistoryPage` — historial con detalle de sesiones
- [x] `RoutinesPage` — gestión completa de rutinas y catálogo de ejercicios
- [x] `ProgressPage` — gráfica de PS por ejercicio con recharts
- [x] Deploy en Vercel con variables de entorno configuradas
- [x] `LoginPage` — email/contraseña + Google OAuth
- [x] `RegisterPage` — nombre, email, contraseña + Google OAuth
- [x] Sesión persistente con `getSession()` + `onAuthStateChange`
- [x] Rutas protegidas: sin sesión → LoginPage
- [x] Botón "Salir" en la nav (`supabase.auth.signOut()`)
- [x] `user` pasado como prop a todas las páginas; RLS filtra datos automáticamente
- [x] `ConnectionsPage` — dos flujos (cliente invita entrenador / entrenador invita cliente)
- [x] `AcceptConnectionPage` — página pública `/connect?token=...` con login/registro inline
- [x] QR generado con `qrcode.react`, enlace copiable, reutiliza tokens pendientes
- [x] `vercel.json` con rewrite para SPA routing en producción
- [x] Nav scrollable en móvil para 6 pestañas
- [x] `ProfilePage` — perfil con toggle is_trainer y botón cerrar sesión
- [x] `ConnectionsPage` — oculta sección entrenador si `is_trainer = false`
- [x] `ExerciseList` — diferenciación visual propios/sistema, filtro "Solo míos", permisos de edición
- [x] `ExerciseForm` — guarda `created_by = user.id` al crear
- [x] `RoutineDetail` — filtro "Solo míos" en el catálogo al añadir ejercicio
- [x] `WorkoutPage` — modal de confirmación antes de finalizar con resumen de series

---

## Pendiente / Ideas para próximas sesiones

- Fase 4: funcionalidades del entrenador (panel de clientes, editar rutinas del cliente, notas)
- Policy RLS para que el entrenador lea `workout_logs` de su cliente (SQL ya documentado arriba)
- Notas en el entrenamiento (`workout_logs.notes`)

---

## Versiones futuras

### v2 — Login y uso propio seguro ✓ COMPLETADO
- Supabase Auth con email/contraseña y Google OAuth
- LoginPage, RegisterPage y sesión persistente implementados
- Rutas protegidas con estado de sesión en App.jsx
- RLS activo en todas las tablas

### v3 — Entrenadores y clientes ✓ COMPLETADO
- Sistema de invitación mediante QR/enlace con token (dos flujos: cliente→entrenador y entrenador→cliente)
- `trainer_connections` con `token`, `type`, `active`; tokens generados en cliente con Web Crypto API
- `AcceptConnectionPage` pública con login/registro inline y Google OAuth que preserva el token
- Gestión de conexiones activas con opción de revocar
- Vista de historial del cliente desde el panel del entrenador

### v4 — Funcionalidades del entrenador ✓ COMPLETADO
- Panel del entrenador con lista de clientes y acceso a su historial y progreso
- Posibilidad de crear/editar rutinas para un cliente
- Notas del entrenador por cliente (`trainer_notes`)
- Policy RLS para leer `workout_logs` del cliente (SQL documentado)

### v5 — Perfil de usuario y mejoras de UX ✓ COMPLETADO
- ProfilePage: nombre, email, toggle "Modo entrenador" (is_trainer), cerrar sesión
- ConnectionsPage oculta la sección de entrenador si is_trainer = false
- Botón "Salir" movido de la nav a ProfilePage; nav queda más limpia
- ExerciseList: diferenciación visual propios/sistema, filtro "Solo míos", permisos edición/borrado
- ExerciseForm: guarda created_by = user.id al crear ejercicios
- RoutineDetail: filtro "Solo míos" en el catálogo de ejercicios
- WorkoutPage: modal de confirmación antes de finalizar con recuento de ejercicios y series

### v5 — App móvil
- React Native con Expo
- Misma base de datos Supabase, sin cambios en el backend

---

## Mensaje para reanudar en una nueva sesión

```
Lee el CONTEXT.md adjunto. GymTracker está desplegado en Vercel y funciona
en producción — React + Vite + Tailwind v4 + Supabase + recharts, sin backend
propio. Autenticación completa (email/contraseña + Google OAuth), sesión
persistente, RLS activo. Ocho pantallas: HomePage, WorkoutPage, HistoryPage,
RoutinesPage, ProgressPage, LoginPage, RegisterPage, ConnectionsPage y
AcceptConnectionPage. Sistema de conexiones entrenador-cliente con QR/enlace
y token funcionando. El siguiente paso es [DESCRIBIR TAREA].
```
