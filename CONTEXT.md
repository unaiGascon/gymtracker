# GymTracker — Contexto del proyecto

> Pega este archivo al inicio de cada sesión con Claude Code o Claude.ai para retomar donde lo dejaste.

---

## Filosofía de desarrollo

- Código simple y legible por encima de todo
- Comentarios en cada función explicando qué hace y por qué
- Sin abstracciones innecesarias — mejor repetir 2 líneas que crear una capa extra
- Avanzar por versiones: v1 mínima funcional, luego mejoras incrementales

---

## Versión actual: v2 — autenticación y multiusuario

La base de datos ya está preparada para múltiples usuarios con RLS por `user_id`.
Las pantallas de login y registro están pendientes de implementar.

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
  description text
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
    supabase.js          — cliente Supabase (importar en páginas)
  pages/
    HomePage.jsx         — pantalla de inicio, elige rutina
    WorkoutPage.jsx      — entrenamiento activo
    HistoryPage.jsx      — historial de sesiones
    RoutinesPage.jsx     — gestión de rutinas y catálogo de ejercicios
    ProgressPage.jsx     — progreso por ejercicio (gráfica PS + tabla)
  App.jsx                — navegación principal
  index.css              — solo @import "tailwindcss"
  main.jsx               — punto de entrada
```

---

## Flujo de navegación

```
HomePage
  └─→ WorkoutPage (recibe routineId + routineName como props)
        └─→ (fin) → HistoryPage
        └─→ (atrás) → HomePage

Barra nav superior: [Inicio] [Historial] [Rutinas] [Progreso]
  (la barra se oculta durante un entrenamiento activo)
```

`App.jsx` gestiona el estado de navegación: `page` ('home' | 'workout' | 'history' | 'routines' | 'progress'), `routineId`, `routineName`.

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
- Botón "Finalizar entrenamiento" fijo abajo: crea `workout_log` + `log_sets`, navega a pantalla de confirmación
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

**Sección Ejercicios:**
- Lista del catálogo con nombre, grupo muscular y descripción
- Crear ejercicio: nombre, grupo muscular (select con 9 opciones), descripción opcional
- Editar ejercicio existente (mismos campos)
- Eliminar con doble confirmación (primer clic → "¿Eliminar?", segundo → borra)

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

---

## Decisiones de diseño tomadas

- Navegación sin react-router: estado `page` en `App.jsx`
- Navegación interna en `RoutinesPage` con estado `view` local
- `WorkoutPage` no tiene pestaña en la nav — se entra siempre desde `HomePage`
- La barra de nav se oculta durante el entrenamiento para no distraer
- Grupos musculares disponibles: Pecho, Espalda, Piernas, Hombros, Bíceps, Tríceps, Cardio, Movilidad, Flexibilidad
- Borradores de entrenamiento en `localStorage`, no en Supabase — `workout_logs.completed` siempre es `true`
- Los inputs de series no usan placeholder con el valor anterior (evita confusión visual); el dato anterior va solo en la columna "Anterior"

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
```

> La tabla `exercises` es global (compartida entre usuarios) o por usuario — confirmar al implementar auth.

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
- [ ] **`LoginPage`** — autenticación con Supabase Auth ← SIGUIENTE
- [ ] **`RegisterPage`** — registro de nuevos usuarios
- [ ] Proteger rutas: redirigir a login si no hay sesión activa
- [ ] Pasar `user.id` a las queries que lo necesiten

---

## Pendiente / Ideas para próximas sesiones

- LoginPage y RegisterPage con Supabase Auth (email + contraseña)
- Gestión de sesión en App.jsx: `supabase.auth.getSession()` al montar, listener `onAuthStateChange`
- Notas en el entrenamiento (`workout_logs.notes`)

---

## Versiones futuras

### v2 — Login y uso propio seguro ← EN CURSO
- Supabase Auth con email/contraseña ✓ (BD lista)
- LoginPage y RegisterPage pendientes de implementar en la app
- Proteger rutas con estado de sesión en App.jsx

### v3 — Entrenadores y clientes
- Roles: admin, trainer, client
- Tabla `invitations` para registro por email
- Panel del entrenador, editor de rutinas

### v4 — Progreso y métricas
- Más métricas en ProgressPage (volumen semanal, récords por ejercicio)
- Estadísticas: sesiones, adherencia, volumen total

### v5 — App móvil
- React Native con Expo
- Misma base de datos Supabase, sin cambios en el backend

---

## Mensaje para reanudar en una nueva sesión

```
Lee el CONTEXT.md adjunto. GymTracker está desplegado en Vercel
y funciona en producción — React + Vite + Tailwind v4 + Supabase + recharts,
sin backend propio. Las cinco pantallas principales están implementadas:
HomePage, WorkoutPage, HistoryPage, RoutinesPage y ProgressPage.
La BD ya tiene las tablas de v2 (profiles, admins, trainer_connections,
trainer_notes) con user_id y RLS por auth.uid() en todas las tablas.
El siguiente paso es [DESCRIBIR TAREA].
```
