# GymTracker — Contexto del proyecto

> Pega este archivo al inicio de cada sesión con Claude Code o Claude.ai para retomar donde lo dejaste.

---

## Filosofía de desarrollo

- Código simple y legible por encima de todo
- Comentarios en cada función explicando qué hace y por qué
- Sin abstracciones innecesarias — mejor repetir 2 líneas que crear una capa extra
- Avanzar por versiones: v1 mínima funcional, luego mejoras incrementales

---

## Versión actual: v9 — navegación reorganizada + notas + actividad del cliente

**La app está desplegada en Vercel y funciona en producción.**

Cambios en v9:
- Navegación reorganizada en 4 tabs de cliente (Inicio | Rutinas | Progreso | Perfil) y 3 de entrenador (Mis clientes | Plantillas | Perfil). Historial, Actividad y Conexiones son sub-pestañas.
- `trainer_notes` añade campo `is_private`: entrenador puede marcar notas como privadas o compartidas. `NotesPage` muestra al cliente solo las compartidas.
- Entrenador puede ver la actividad diaria (pasos + actividades) de cada cliente desde su ficha.
- `WorkoutPage`: columna "Anterior" reemplazada por botón de confirmación de serie. Temporizador solo se dispara desde ese botón. "Finalizar" ya no es flotante.

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
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  name         text,
  is_trainer   boolean default false,   -- activa el modo entrenador
  rest_seconds int     default 90,      -- duración del temporizador de descanso (0 = desactivado)
  rest_alert   text    default 'both',  -- 'vibrate' | 'sound' | 'both'
  created_at   timestamptz default now()
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
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid references auth.users(id) on delete cascade,
  client_id  uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
```

### `trainer_notes`
Notas del entrenador sobre un cliente.
```sql
create table trainer_notes (
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid references auth.users(id) on delete cascade,
  client_id  uuid references auth.users(id) on delete cascade,
  content    text,
  is_private boolean not null default false,  -- true = solo el entrenador la ve; false = compartida con el cliente
  created_at timestamptz default now()
);
```

> **Pendiente de aplicar en Supabase:**
> ```sql
> alter table trainer_notes add column if not exists is_private boolean not null default false;
> ```
> Y las políticas RLS correspondientes para que el cliente solo lea notas con `is_private = false`.

### `exercises`
Catálogo de ejercicios. Gestionable desde la app (pantalla Rutinas → Ejercicios).
```sql
create table exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  muscle_group text,
  description text,
  created_by  uuid references auth.users(id)  -- null = ejercicio del sistema; uuid = creado por ese usuario
);
```

### `routines`
Las rutinas disponibles. Tienen un campo `order` para el ciclo semanal.
```sql
create table routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  notes      text,
  "order"    int,          -- orden en el ciclo (1, 2, 3...)
  created_at timestamptz default now()
);
```

### `routine_exercises`
Qué ejercicios tiene cada rutina, en qué bloque y en qué orden.
```sql
create table routine_exercises (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid references routines(id) on delete cascade,
  exercise_id   uuid references exercises(id) on delete cascade,
  block         text not null,    -- 'warmup' | 'main' | 'cardio' | 'cooldown'
  sets          int,
  reps          int,
  weight_kg     float,
  duration_min  int,              -- para ejercicios por tiempo (cardio, movilidad...)
  "order"       int,
  superset_group text             -- nullable: mismo valor = superserie
);
```

### `workout_logs`
Registro de cada sesión completada.
```sql
create table workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  routine_id  uuid references routines(id),
  logged_date date default current_date,
  notes       text,
  completed   boolean default true  -- siempre true; los borradores van en localStorage
);
```

### `log_sets`
Series reales registradas en cada sesión.
```sql
create table log_sets (
  id          uuid primary key default gen_random_uuid(),
  log_id      uuid references workout_logs(id) on delete cascade,
  exercise_id uuid references exercises(id),
  set_number  int,
  reps_done   int,
  weight_done float
);
```

### `daily_activity`
Registro diario de pasos. Un registro por usuario por día (restricción única `user_id, date`).
```sql
create table daily_activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  date       date not null,
  steps      int,
  notes      text,
  created_at timestamptz default now(),
  unique(user_id, date)
);
```

### `activity_logs`
Actividades extra del día (running, ciclismo, natación…). Vinculadas a un `daily_activity`.
```sql
create table activity_logs (
  id                uuid primary key default gen_random_uuid(),
  daily_activity_id uuid references daily_activity(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete cascade,
  type              text not null,
  duration_min      int,
  notes             text,
  created_at        timestamptz default now()
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
    HomePage.jsx               — pantalla de inicio, elige rutina; banner de notas nuevas
    WorkoutPage.jsx            — entrenamiento activo con confirmación de series
    HistoryPage.jsx            — historial de sesiones (onBack opcional: sub-tab o pantalla)
    RoutinesPage.jsx           — Mis rutinas | Ejercicios | Historial (sub-pestañas)
    ProgressPage.jsx           — Progreso | Actividad (sub-pestañas)
    ActivityPage.jsx           — registro de pasos y actividades extra (sub-pestaña de Progreso)
    LoginPage.jsx              — email/contraseña + Google OAuth
    RegisterPage.jsx           — nombre, email, contraseña + Google OAuth
    ConnectionsPage.jsx        — conexiones entrenador-cliente + ficha de cliente con actividad
    AcceptConnectionPage.jsx   — página pública /connect?token=... para aceptar invitaciones
    ProfilePage.jsx            — Mi perfil | Conexiones (sub-pestañas)
    NotesPage.jsx              — notas compartidas del entrenador (solo lectura, cliente)
  App.jsx                      — navegación principal + detección de ruta /connect
  index.css                    — solo @import "tailwindcss"
  main.jsx                     — punto de entrada
vercel.json                    — rewrite /* → /index.html para SPA routing
```

---

## Flujo de navegación

```
/connect?token=...  →  AcceptConnectionPage (pública, sin sesión requerida)

MODO CLIENTE — 4 pestañas principales:
  Inicio      → HomePage
                  └─→ WorkoutPage (recibe routineId + routineName)
                        └─→ (fin) → RoutinesPage
                        └─→ (atrás) → HomePage
                  └─→ NotesPage (desde banner de notas nuevas)
  Rutinas     → RoutinesPage   (sub-tabs: Mis rutinas | Ejercicios | Historial)
  Progreso    → ProgressPage   (sub-tabs: Progreso | Actividad)
  Perfil      → ProfilePage    (sub-tabs: Mi perfil | Conexiones)

MODO ENTRENADOR — 3 pestañas principales:
  Mis clientes → ConnectionsPage (trainerOnly=true)
  Plantillas   → RoutinesPage    (defaultTab="templates")
  Perfil       → ProfilePage     (sub-tabs: Mi perfil | Conexiones)
```

`App.jsx` gestiona el estado de navegación: `page` ('home' | 'workout' | 'routines' | 'progress' | 'profile' | 'clients' | 'templates' | 'notes' | 'history').
- Modo cliente: tabs `[home, routines, progress, profile]`
- Modo entrenador: tabs `[clients, templates, profile]`
- `isTrainer` cargado del perfil al iniciar sesión; al cambiar el toggle → `window.location.reload()` para aplicar la navegación correcta.
- Detección de `/connect?token=...` via `URLSearchParams` antes de evaluar la sesión.

**Recuperación de entrenamiento activo tras recarga:**
- `WorkoutPage` guarda `activeRoutineId` y `activeRoutineName` en localStorage al montar; los borra al finalizar.
- `App.jsx` inicializa `page` y `routineId` con lazy initializer desde localStorage → arranca directamente en `WorkoutPage` si había entrenamiento en curso.
- `HomePage` muestra un banner negro "Entrenamiento en curso →" si existe `activeRoutineId`.

**Notificación de notas nuevas:**
- Al cargar perfil de cliente, `checkNewNotes()` compara `trainer_notes` más recientes que `notesLastVisited` en localStorage.
- Si hay notas nuevas, `HomePage` muestra banner azul "Tu entrenador ha dejado notas nuevas →" → navega a `NotesPage`.
- `NotesPage` actualiza `notesLastVisited` al montar.

---

## Pantallas implementadas

### HomePage (`src/pages/HomePage.jsx`)
- Carga rutinas de Supabase ordenadas por `routines.order`
- Determina qué rutina toca hoy: busca el último `workout_log`, toma la rutina siguiente en el ciclo (wrap-around). Sin historial → la primera.
- Resalta la rutina del día con fondo negro + badge "Hoy"
- Todas las rutinas son clicables para elegir cualquiera
- Banner negro "Entrenamiento en curso →" si `localStorage.activeRoutineId` existe
- Banner azul "Tu entrenador ha dejado notas nuevas →" si `hasNewNotes = true` (props)

### WorkoutPage (`src/pages/WorkoutPage.jsx`)
- Recibe `routineId` y `routineName` como props
- Carga `routine_exercises` con `exercises(*)` ordenados por `order`
- Ejercicios con `duration_min`: muestra "X min", sin inputs
- Ejercicios con `sets`+`reps`: inputs de reps y peso por serie
- **Borrador en localStorage** (clave `workout_draft_{routineId}`):
  - Cada cambio de input persiste el estado completo, incluyendo campo `confirmed` por serie
  - Al montar, si existe borrador se carga (merge backward-compatible con `{ confirmed: false, ...s }`)
  - Al finalizar, se guarda en Supabase y se elimina el borrador
- **Columna "✓" — botón de confirmación de serie:**
  - Muestra el dato previo ("11r × 35") o "✓" si no hay historial anterior
  - Al pulsar: valida que reps Y peso estén rellenos; si no, ignora
  - Marca la serie como `confirmed: true` (fondo negro, bloqueado)
  - Lanza el temporizador de descanso (si no está ya corriendo)
  - Si es la última serie del ejercicio, no lanza el temporizador
- **Ejercicio completado:** `allConfirmed` → `opacity-40`
- **Botón "Finalizar entrenamiento"** al final del listado (no flotante): abre modal de confirmación
- **Modal de confirmación** (`ConfirmFinishModal`): muestra ejercicios completados y series registradas; "Sí, finalizar" guarda, "Cancelar" vuelve
- Pantalla de confirmación tras guardar con "Volver al inicio" y "Ver historial"
- **Temporizador de descanso** (`RestTimer`): panel negro en esquina inferior izquierda
  - Solo se lanza desde el botón de confirmación de serie
  - No se reinicia si ya está corriendo (pulsar otro botón de serie no lo reinicia)
  - Cuenta atrás grande + barra de progreso + "Siguiente: Serie X · Ejercicio"
  - Al llegar a 0: `navigator.vibrate` + beep Web Audio API (según `rest_alert`)
  - Botón "Saltar descanso" para cancelar manualmente
  - Duración desde `profiles.rest_seconds` (default 90s); 0 = desactivado

### HistoryPage (`src/pages/HistoryPage.jsx`)
- Lista de `workout_logs` con `routines(name)` y conteo de ejercicios únicos, ordenados por fecha desc
- Fecha formateada como "mié 15 ene" (parseada como fecha local, sin desfase de zona horaria)
- Clic en sesión → detalle con `log_sets` + `exercises(name, muscle_group)`, agrupados por ejercicio
- Botón `←` solo visible si se pasa la prop `onBack` (funciona como sub-tab en Rutinas sin back button)

### RoutinesPage (`src/pages/RoutinesPage.jsx`)
Tres sub-pestañas: **Mis rutinas** | **Ejercicios** | **Historial**

**Mis rutinas (lista + detalle):**
- Clic en nombre de rutina → expande panel con "Ver ejercicios" / "Editar"
- Botones ↑↓ para reordenar rutinas; formulario para crear rutina nueva
- Detalle: ejercicios agrupados por bloque, editar/eliminar/reordenar, añadir con filtro por músculo
- Superseries: "Unir / Separar superserie" entre ejercicios consecutivos del mismo bloque

**Ejercicios:**
- Catálogo con diferenciación propios/sistema (badge "Mío"/"Sistema", fondo morado/blanco)
- Filtro pills "Todos" / "Solo míos"; editar/eliminar solo en propios con doble confirmación
- Crear ejercicio: nombre, grupo muscular (9 opciones), descripción opcional

**Historial:**
- Embebe `HistoryPage` sin `onBack` (sin botón de volver, es sub-pestaña)

**Modo plantillas** (`defaultTab="templates"`):
- Solo visible para entrenadores (tab "Plantillas" en el modo entrenador)
- Misma UI que "Mis rutinas" pero gestionando plantillas del entrenador

### ProgressPage (`src/pages/ProgressPage.jsx`)
Dos sub-pestañas: **Progreso** | **Actividad**

**Progreso (lista + detalle):**
- Lista de ejercicios entrenados al menos una vez
- Detalle: gráfica de línea (recharts) con Performance Score por sesión
- `PS = (peso_max × mejor_serie_reps) + (volumen_total × 0.1)`
- Tabla debajo: fecha, peso máx, volumen, PS. Requiere mínimo 2 sesiones.
- Sub-pestañas se ocultan al entrar en el detalle de un ejercicio

**Actividad:**
- Embebe `ActivityPage` con pasos diarios y actividades extra (sub-tabs: Hoy | Historial)

### ActivityPage (`src/pages/ActivityPage.jsx`)
- **Hoy**: registro de pasos (upsert en `daily_activity`) + actividades extra (running, ciclismo…)
- **Historial**: últimos 30 días con gráfica de barras de pasos (últimos 7 días) + lista con pills

### ConnectionsPage (`src/pages/ConnectionsPage.jsx`)
En modo entrenador (`trainerOnly=true` desde la tab "Mis clientes") muestra directamente la sección entrenador.
En modo cliente (desde Perfil → Conexiones) carga `is_trainer` y muestra ambos flujos si procede.

**Soy cliente:**
- Genera token `client_invites_trainer` — QR + enlace copiable
- Lista de entrenadores conectados con opción de revocar

**Soy entrenador:**
- Genera token `trainer_invites_client` — QR + enlace copiable
- Lista de clientes; clic → `ClientDetailView`

**`ClientDetailView` — ficha del cliente (sub-tabs):**
- **Historial**: `workout_logs` del cliente
- **Progreso**: gráfica PS por ejercicio del cliente
- **Notas**: `ClientNotes` — lista de notas del entrenador para ese cliente
  - Toggle "Compartir con cliente" al crear (campo `is_private`)
  - Badges "Privada" (gris) / "Compartida" (verde) por nota
  - Borrar con doble confirmación
- **Actividad**: `ClientActivity` — actividad diaria del cliente (últimos 30 días, solo lectura)
  - Gráfica de barras de pasos (últimos 7 días)
  - Lista de días con pasos y actividades como pills

### ProfilePage (`src/pages/ProfilePage.jsx`)
Dos sub-pestañas: **Mi perfil** | **Conexiones**

**Mi perfil:**
- Avatar con inicial del nombre, nombre completo y email
- Toggle "Modo entrenador" — lee/escribe `profiles.is_trainer`; al cambiar → `window.location.reload()`
- Configuración del temporizador de descanso (solo en modo cliente): pills 0/60/90/120/180s + input personalizado
- Tipo de aviso al acabar (solo si timer activo): Vibración | Sonido | Vibración+Sonido
- Botón "Cerrar sesión"

**Conexiones:**
- Embebe `ConnectionsPage` sin `trainerOnly`

### NotesPage (`src/pages/NotesPage.jsx`)
- Solo para clientes; accesible desde banner en HomePage
- Carga notas del entrenador donde `client_id = user.id` AND `is_private = false`
- Muestra nombre del entrenador (de `profiles`) + fecha + contenido de cada nota
- Al montar: guarda `notesLastVisited = now()` en localStorage y llama `onVisit()` para limpiar la badge

### AcceptConnectionPage (`src/pages/AcceptConnectionPage.jsx`)
Página pública en `/connect?token=TOKEN`.
- Sin token válido → "Enlace no válido"
- Con campos ya rellenos → "Enlace ya usado"
- Sin sesión → formulario inline login/registro con Google OAuth (preserva el token)
- Con sesión → muestra quién invita, botón "Aceptar" rellena el campo vacío y pone `active=true`

---

## Decisiones de diseño tomadas

- Navegación sin react-router: estado `page` en `App.jsx`; excepción: `/connect` detectado con `URLSearchParams`
- `isTrainer` cargado del perfil al iniciar sesión determina qué juego de tabs mostrar
- Al cambiar `is_trainer` desde ProfilePage → `window.location.reload()` (intencional: la nav cambia completamente)
- Sub-pestañas internas (RoutinesPage, ProgressPage, ProfilePage) con estado local; no se reflejan en la URL
- `WorkoutPage` no tiene pestaña en la nav — se entra siempre desde HomePage
- Ambas barras de nav se ocultan durante el entrenamiento; contenido con `pb-24 md:pb-0`
- Borradores de entrenamiento en `localStorage`, no en Supabase — `workout_logs.completed` siempre `true`
- Campo `confirmed` por serie en el borrador: `{ reps, weight, confirmed }` — backward-compatible al cargar borradores viejos
- Temporizador de descanso: no se reinicia si ya está corriendo; ignora pulsación si reps o peso vacíos
- `HistoryPage.onBack` es opcional: con prop → botón volver visible; sin prop → sin botón (sub-tab)
- Tokens de conexión: hex de 32 chars con `crypto.getRandomValues` en el cliente
- Grupos musculares: Pecho, Espalda, Piernas, Hombros, Bíceps, Tríceps, Cardio, Movilidad, Flexibilidad

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

-- Para que el entrenador pueda leer workout_logs de su cliente:
create policy "trainer can read client logs" on workout_logs
  using (exists (
    select 1 from trainer_connections
    where trainer_id = auth.uid()
      and client_id = workout_logs.user_id
      and active = true
  ));

-- daily_activity y activity_logs: propio + entrenador conectado puede leer
alter table daily_activity enable row level security;
create policy "own data" on daily_activity
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "trainer can read client activity" on daily_activity
  using (exists (
    select 1 from trainer_connections
    where trainer_id = auth.uid()
      and client_id = daily_activity.user_id
      and active = true
  ));

alter table activity_logs enable row level security;
create policy "own data" on activity_logs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "trainer can read client activity logs" on activity_logs
  using (exists (
    select 1 from trainer_connections
    where trainer_id = auth.uid()
      and client_id = activity_logs.user_id
      and active = true
  ));

-- trainer_notes: entrenador escribe/lee todo; cliente solo lee is_private=false
create policy "trainer owns notes" on trainer_notes
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);
create policy "client reads shared notes" on trainer_notes
  using (auth.uid() = client_id and is_private = false);
```

---

## Estado actual

- [x] Proyecto React + Vite + Tailwind v4 inicializado
- [x] Cliente Supabase instalado y configurado
- [x] Proyecto Supabase creado con credenciales en `.env`
- [x] Tablas originales creadas (`exercises`, `routines`, `routine_exercises`, `workout_logs`, `log_sets`)
- [x] Tablas de v2 creadas (`profiles`, `admins`, `trainer_connections`, `trainer_notes`)
- [x] `user_id` añadido a `exercises`, `routines`, `workout_logs`
- [x] RLS activado con políticas basadas en `auth.uid()`
- [x] `HomePage` — selección de rutina con "Hoy" automático + banners de entrenamiento activo y notas nuevas
- [x] `WorkoutPage` — botón de confirmación de serie, temporizador solo desde botón, Finalizar no flotante
- [x] `HistoryPage` — historial con detalle de sesiones, `onBack` opcional
- [x] `RoutinesPage` — Mis rutinas | Ejercicios | Historial (sub-tabs)
- [x] `ProgressPage` — Progreso | Actividad (sub-tabs)
- [x] `ActivityPage` — pasos + actividades extra (Hoy | Historial)
- [x] Deploy en Vercel con variables de entorno configuradas
- [x] `LoginPage` — email/contraseña + Google OAuth
- [x] `RegisterPage` — nombre, email, contraseña + Google OAuth
- [x] Sesión persistente con `getSession()` + `onAuthStateChange`
- [x] `ConnectionsPage` — ficha de cliente con 4 sub-tabs: Historial | Progreso | Notas | Actividad
- [x] `ClientNotes` — notas con `is_private`, badges Privada/Compartida, doble confirmación al borrar
- [x] `ClientActivity` — actividad diaria del cliente (read-only) para el entrenador
- [x] `AcceptConnectionPage` — página pública `/connect?token=...` con login/registro inline
- [x] QR con `qrcode.react`, enlace copiable, reutiliza tokens pendientes
- [x] `vercel.json` con rewrite para SPA routing en producción
- [x] `ProfilePage` — Mi perfil | Conexiones (sub-tabs); toggle is_trainer, config descanso, cerrar sesión
- [x] `NotesPage` — notas compartidas del entrenador, solo lectura, actualiza `notesLastVisited`
- [x] Navegación adaptativa 4-tabs cliente / 3-tabs entrenador (móvil bottom nav + PC top nav)
- [x] Temporizador de descanso configurable (duración + tipo de aviso) en `WorkoutPage`
- [x] `profiles.rest_seconds` y `profiles.rest_alert` configurables desde `ProfilePage`
- [x] `trainer_notes.is_private` — notas privadas/compartidas con badge visual
- [x] Tablas `daily_activity` y `activity_logs` con RLS (propio + entrenador conectado)

### Pendiente de aplicar en Supabase
- Políticas RLS de `trainer_notes`: que el entrenador pueda escribir/leer sus notas y que el cliente solo lea `is_private = false`
- Políticas RLS de `daily_activity` y `activity_logs`: que el entrenador conectado pueda leer datos del cliente

> `ALTER TABLE trainer_notes ADD COLUMN ... is_private` — **ya aplicado** (verificado vía REST API)

---

## Versiones completadas

### v1–v5: Base, auth, conexiones, perfil ✓
### v6 — Navegación adaptativa + recuperación de entrenamiento ✓
### v7 — Registro de actividad diaria (pasos + actividades extra) ✓
### v8 — Temporizador de descanso entre series ✓
- Configurable: duración (0/60/90/120/180s + personalizado) y tipo de aviso (vibración/sonido/ambos)
- Campos en `profiles`: `rest_seconds int default 90`, `rest_alert text default 'both'`

### v9 — Navegación reorganizada + notas + actividad del cliente ✓
- 4 tabs cliente (Inicio|Rutinas|Progreso|Perfil), 3 tabs entrenador (Mis clientes|Plantillas|Perfil)
- Historial → sub-tab de Rutinas; Actividad → sub-tab de Progreso; Conexiones → sub-tab de Perfil
- `trainer_notes.is_private`: notas privadas/compartidas; `NotesPage` muestra al cliente solo las compartidas
- `ClientActivity` en ficha de cliente: actividad diaria del cliente visible para el entrenador
- `WorkoutPage`: columna "✓" con botón de confirmación de serie (reemplaza "Anterior")
- Temporizador solo desde botón de confirmación; no se reinicia si ya corre

---

## Mensaje para reanudar en una nueva sesión

```
Lee el CONTEXT.md adjunto. GymTracker está desplegado en Vercel — React + Vite +
Tailwind v4 + Supabase + recharts, sin backend propio. Autenticación completa,
RLS activo. Navegación adaptativa: 4 tabs cliente (Inicio|Rutinas|Progreso|Perfil),
3 tabs entrenador (Mis clientes|Plantillas|Perfil), con sub-pestañas internas.
Pantallas: HomePage, WorkoutPage (botón confirmación de serie), HistoryPage,
RoutinesPage (Mis rutinas|Ejercicios|Historial), ProgressPage (Progreso|Actividad),
ActivityPage, ConnectionsPage (ficha cliente con Historial|Progreso|Notas|Actividad),
ProfilePage (Mi perfil|Conexiones), NotesPage, AcceptConnectionPage.
El siguiente paso es [DESCRIBIR TAREA].
```
