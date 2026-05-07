-- SoyMomo CS Dashboard — ejecutar en Supabase SQL Editor

-- Espejo en vivo de tickets open/pending (UPSERT cada 60s)
CREATE TABLE IF NOT EXISTS public.cs_tickets_snapshot (
  id BIGINT PRIMARY KEY,
  estado TEXT NOT NULL,
  prioridad TEXT,
  canal TEXT,
  marca TEXT,
  inbox_id INT,
  inbox_nombre TEXT,
  agente_id INT,
  agente_nombre TEXT,
  equipo_id INT,
  equipo_nombre TEXT,
  cliente_id BIGINT,
  creado_en TIMESTAMPTZ,
  primera_respuesta_en TIMESTAMPTZ,
  resuelto_en TIMESTAMPTZ,
  ultima_actividad_en TIMESTAMPTZ,
  frt_segundos INT,
  art_segundos INT,
  sla_cumplido BOOLEAN,
  labels TEXT[],
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Métricas agregadas por día (retención 1 año)
CREATE TABLE IF NOT EXISTS public.cs_metricas_diarias (
  fecha DATE PRIMARY KEY,
  tickets_entrantes INT DEFAULT 0,
  tickets_resueltos INT DEFAULT 0,
  tickets_reabiertos INT DEFAULT 0,
  backlog_nocturno INT DEFAULT 0,
  frt_promedio_seg INT,
  frt_mediana_seg INT,
  frt_p90_seg INT,
  art_promedio_seg INT,
  art_mediana_seg INT,
  pct_sla NUMERIC(5,2),
  por_categoria JSONB DEFAULT '{}',
  por_canal JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Métricas por agente por día
CREATE TABLE IF NOT EXISTS public.cs_metricas_agente (
  fecha DATE NOT NULL,
  agente_id INT NOT NULL,
  agente_nombre TEXT,
  tickets_tomados INT DEFAULT 0,
  tickets_resueltos INT DEFAULT 0,
  tickets_abiertos_fin INT DEFAULT 0,
  frt_promedio_seg INT,
  pct_sla NUMERIC(5,2),
  PRIMARY KEY (fecha, agente_id)
);

-- Métricas por hora para heatmap
CREATE TABLE IF NOT EXISTS public.cs_metricas_horarias (
  fecha_hora TIMESTAMPTZ PRIMARY KEY,
  tickets_entrantes INT DEFAULT 0,
  tickets_resueltos INT DEFAULT 0,
  frt_promedio_seg INT
);

-- Si la tabla ya existe, ejecutar:
-- ALTER TABLE public.cs_tickets_snapshot ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ;

-- Índices
CREATE INDEX IF NOT EXISTS idx_snap_estado    ON public.cs_tickets_snapshot(estado);
CREATE INDEX IF NOT EXISTS idx_snap_agente    ON public.cs_tickets_snapshot(agente_id);
CREATE INDEX IF NOT EXISTS idx_snap_creado    ON public.cs_tickets_snapshot(creado_en);
CREATE INDEX IF NOT EXISTS idx_snap_actividad ON public.cs_tickets_snapshot(ultima_actividad_en);
CREATE INDEX IF NOT EXISTS idx_snap_canal     ON public.cs_tickets_snapshot(canal);
CREATE INDEX IF NOT EXISTS idx_snap_marca     ON public.cs_tickets_snapshot(marca);
CREATE INDEX IF NOT EXISTS idx_snap_synced    ON public.cs_tickets_snapshot(synced_at);
