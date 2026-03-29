# GymTracker — Contexto del proyecto

> Pega este archivo al inicio de cada sesión con Claude Code o Claude.ai para retomar donde lo dejaste.

---

## Filosofía de desarrollo

- Código simple y legible por encima de todo
- Comentarios en cada función explicando qué hace y por qué
- Sin abstracciones innecesarias — mejor repetir 2 líneas que crear una capa extra
- Avanzar por versiones: v1 mínima funcional, luego mejoras incrementales

---

## Versión actual: v1.1 — uso personal

Sin login, sin roles, sin entrenadores. Solo una persona usando la app para registrar sus entrenamientos.

---

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | React 19 + Vite 8 | `npm run dev` → localhost:5173 |
| Estilos | Tailwind CSS v4 | Plugin `@tailwindcss/vite` (NO postcss). `@import "tailwindcss"` en index.css |
| Base de datos | Supabase (PostgreSQL) | Actúa de BD y API — sin backend propio |
| Ejecución | Local (localhost) | Sin deploy aún |

**Credenciales Supabase** en `.env` (en `.gitignore`, nunca subir):
```
VITE_SUPABASE_URL=https://tagzwyoigooccmprpvdy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Cliente Supabase exportado desde `src/lib/supabase.js`.

---

## Esquema de base de datos

### `exercises`
Catálogo de ejercicios. Gestionable desde la app (pantalla Rutinas → Ejercicios).
```sql
create table exercises (
  id uuid primary key default gen_random_uuid(),
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
  routine_id uuid references routines(id),
  exercise_id uuid references exercises(id),
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
  routine_id uuid references routines(id),
  logged_date date default current_date,
  notes text
);
```

### `log_sets`
Series reales registradas en cada sesión.
```sql
create table log_sets (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references workout_logs(id),
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

Barra nav superior: [Inicio] [Historial] [Rutinas]
  (la barra se oculta durante un entrenamiento activo)
```

`App.jsx` gestiona el estado de navegación: `page` ('home' | 'workout' | 'history' | 'routines'), `routineId`, `routineName`.

---

## Pantallas implementadas

### HomePage (`src/pages/HomePage.jsx`)
- Carga rutinas de Supabase ordenadas por `routines.order`
- Determina qué rutina toca hoy: busca el último `workout_log`, toma la rutina siguiente en el ciclo (wrap-around). Sin historial → la primera.
- Resalta la rutina del día con fondo negro + badge "Hoy"
- Todas las rutinas son clicables para elegir cualquiera

### WorkoutPage (`src/pages/WorkoutPage.jsx`)
- Recibe `routineId` y `routineName` como props (no carga rutinas)
- Carga `routine_exercises` con `exercises(*)` ordenados por `order`
- Ejercicios con `duration_min`: muestra "X min", sin inputs
- Ejercicios con `sets`+`reps`: inputs de reps y peso por serie
- Columna "Anterior": dato del último `workout_log` para ese ejercicio (verde + ↑ si supera)
- Superseries: barra lateral morada 4px, etiqueta "SUPERSERIE"
- Ejercicios completados (todos los inputs rellenos): `opacity-40`
- Botón "Finalizar entrenamiento" fijo abajo: crea `workout_log` + `log_sets`
- Pantalla de confirmación tras guardar con "Volver al inicio" y "Ver historial"

### HistoryPage (`src/pages/HistoryPage.jsx`)
- Lista de `workout_logs` con `routines(name)` y conteo de ejercicios únicos, ordenados por fecha desc
- Fecha formateada como "mié 15 ene" (parseada como fecha local, sin desfase de zona horaria)
- Clic en sesión → detalle con `log_sets` + `exercises(name, muscle_group)`, agrupados por ejercicio
- Botón `←` para volver al inicio

### RoutinesPage (`src/pages/RoutinesPage.jsx`)
Dos secciones con pestañas internas ("Rutinas" / "Ejercicios"):

**Sección Rutinas:**
- Lista de rutinas con nombre y número de orden
- Crear rutina nueva (nombre + orden)
- Detalle de rutina: ejercicios agrupados por bloque con configuración resumida
  - Añadir ejercicio: elige bloque, ejercicio del catálogo, sets/reps/peso o duration_min
  - Eliminar ejercicio (botón ×)

**Sección Ejercicios:**
- Lista del catálogo con nombre, grupo muscular y descripción
- Crear ejercicio: nombre, grupo muscular (select con 9 opciones), descripción opcional
- Editar ejercicio existente (mismos campos)
- Eliminar con doble confirmación (primer clic → "¿Eliminar?", segundo → borra)

---

## Decisiones de diseño tomadas

- Navegación sin react-router: estado `page` en `App.jsx`
- Navegación interna en `RoutinesPage` con estado `view` local
- `WorkoutPage` no tiene pestaña en la nav — se entra siempre desde `HomePage`
- La barra de nav se oculta durante el entrenamiento para no distraer
- Grupos musculares disponibles: Pecho, Espalda, Piernas, Hombros, Bíceps, Tríceps, Cardio, Movilidad, Flexibilidad

---

## Estado actual

- [x] Proyecto React + Vite + Tailwind v4 inicializado
- [x] Cliente Supabase instalado y configurado
- [x] Proyecto Supabase creado con credenciales en `.env`
- [x] Esquema de base de datos diseñado (SQL listo arriba)
- [x] `HomePage` — selección de rutina con "Hoy" automático
- [x] `WorkoutPage` — registro de series completo
- [x] `HistoryPage` — historial con detalle de sesiones
- [x] `RoutinesPage` — gestión de rutinas y catálogo de ejercicios
- [ ] Crear las tablas en Supabase (ejecutar el SQL del apartado anterior)
- [ ] Poblar el catálogo de ejercicios con datos iniciales
- [ ] Crear las primeras rutinas con sus ejercicios
- [ ] Prueba completa de un entrenamiento de principio a fin

---

## Pendiente / Ideas para próximas sesiones

- Reordenar ejercicios dentro de una rutina (drag & drop o botones ↑↓)
- Editar nombre/orden de una rutina existente
- Editar la configuración de un ejercicio dentro de una rutina (sets, reps, peso objetivo)
- Soporte de superseries en el formulario de `RoutinesPage` (campo `superset_group`)
- Notas en el entrenamiento (`workout_logs.notes`)

---

## Versiones futuras (no tocar hasta completar v1)

### v2 — Login y uso propio seguro
- Supabase Auth con email/contraseña
- Row Level Security en Supabase
- Añadir `user_id` a `workout_logs` y `routines`

### v3 — Entrenadores y clientes
- Roles: admin, trainer, client
- Tabla `invitations` para registro por email
- Panel del entrenador, editor de rutinas

### v4 — Progreso y métricas
- Gráficas de evolución por ejercicio
- Estadísticas: sesiones, adherencia, volumen total

### v5 — App móvil
- React Native con Expo
- Misma base de datos Supabase, sin cambios en el backend

---

## Mensaje para reanudar en una nueva sesión

```
Lee el CONTEXT.md adjunto. GymTracker v1 está casi completo —
React + Vite + Tailwind v4 + Supabase, sin backend propio.
Las cuatro pantallas están implementadas: HomePage, WorkoutPage,
HistoryPage y RoutinesPage. El siguiente paso es [DESCRIBIR TAREA].
```
