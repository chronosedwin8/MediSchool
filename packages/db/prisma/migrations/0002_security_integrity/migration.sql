-- ════════════════════════════════════════════════════════════════════════════
-- 0002 — Security & integrity (hand-written, PLAN §7.10 / §10)
--   * Application role without superuser (RLS applies)
--   * Row Level Security by tenant on every business table
--   * Hash chains (encounters, encounter notes, medication administrations, audit)
--   * No DELETE on clinical / meds / audit; closed encounters are immutable
--   * Pass state transitions enforced in the database
--   * CHECK constraints, trigram / partial / BRIN indexes
--   * Partitioned audit log, reporting materialized views behind tenant views
-- NOTE: future `prisma migrate diff` output must be reviewed so it does not
-- revert the objects created here (see docs/ADR/0002-database.md).
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgee_app') THEN
    CREATE ROLE sgee_app LOGIN;
  END IF;
END $$;

-- ── helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION core.rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on' $$;

CREATE OR REPLACE FUNCTION core.f_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- ── audit log: partitioned by month ────────────────────────────────────────
DROP TABLE audit.audit_log;
CREATE TABLE audit.audit_log (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  tenant_id     uuid,
  actor_user_id uuid,
  actor_role    text,
  action        text        NOT NULL,
  entity        text        NOT NULL,
  entity_id     text,
  before        jsonb,
  after         jsonb,
  ip            text,
  user_agent    text,
  request_id    text,
  hash          text,
  prev_hash     text,
  CONSTRAINT audit_log_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX audit_log_tenant_id_entity_entity_id_idx ON audit.audit_log (tenant_id, entity, entity_id);
CREATE INDEX audit_log_tenant_id_actor_user_id_idx ON audit.audit_log (tenant_id, actor_user_id);
CREATE INDEX audit_log_created_at_brin ON audit.audit_log USING brin (created_at);
CREATE TABLE audit.audit_log_default PARTITION OF audit.audit_log DEFAULT;

CREATE OR REPLACE FUNCTION audit.ensure_partitions(p_from date, p_months int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit AS $$
DECLARE i int; d date; n text; created int := 0;
BEGIN
  FOR i IN 0..p_months - 1 LOOP
    d := (date_trunc('month', p_from) + make_interval(months => i))::date;
    n := 'audit_log_' || to_char(d, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'audit' AND c.relname = n) THEN
      EXECUTE format('CREATE TABLE audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)', n, d, (d + interval '1 month')::date);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;
SELECT audit.ensure_partitions('2024-01-01'::date, 48);

-- ── hash chains ────────────────────────────────────────────────────────────
CREATE TABLE audit.chain_heads (
  chain_key  text PRIMARY KEY,
  last_hash  text,
  length     bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit.chain_append(p_key text, p_payload text, OUT prev_hash text, OUT hash text, OUT seq bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, audit AS $$
BEGIN
  INSERT INTO audit.chain_heads (chain_key) VALUES (p_key) ON CONFLICT (chain_key) DO NOTHING;
  SELECT h.last_hash, h.length INTO prev_hash, seq FROM audit.chain_heads h WHERE h.chain_key = p_key FOR UPDATE;
  hash := encode(public.digest(coalesce(prev_hash, 'GENESIS') || '|' || p_payload, 'sha256'), 'hex');
  seq := seq + 1;
  UPDATE audit.chain_heads SET last_hash = hash, length = seq, updated_at = now() WHERE chain_key = p_key;
END $$;

CREATE OR REPLACE FUNCTION audit.ts(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '') $$;

-- audit log rows
CREATE OR REPLACE FUNCTION audit.audit_log_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM audit.chain_append(
    'audit:' || coalesce(NEW.tenant_id::text, 'system'),
    concat_ws('|', NEW.id, audit.ts(NEW.created_at), coalesce(NEW.tenant_id::text, ''), coalesce(NEW.actor_user_id::text, ''),
              NEW.action, NEW.entity, coalesce(NEW.entity_id, ''), coalesce(NEW.before::text, ''), coalesce(NEW.after::text, '')));
  NEW.prev_hash := r.prev_hash;
  NEW.hash := r.hash;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_log_hash BEFORE INSERT ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION audit.audit_log_hash();

CREATE OR REPLACE FUNCTION audit.forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SGEE_IMMUTABLE: % on %.% is not allowed (records are append-only; use annulment)', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

-- encounters
CREATE OR REPLACE FUNCTION clinical.encounter_payload(e clinical.encounters) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws('|', e.id, e.tenant_id, e.person_id, e.type, e.chief_complaint, audit.ts(e.started_at), audit.ts(e.ended_at),
    coalesce(e.disposition, ''), coalesce(e.subjective, ''), coalesce(e.objective, ''), coalesce(e.assessment, ''), coalesce(e.plan, ''),
    e.physical_exam::text, e.treatments::text, coalesce(e.parent_summary, ''), coalesce(e.signed_by_user_id::text, ''), audit.ts(e.signed_at),
    coalesce(e.historical_data::text, ''))
$$;

CREATE OR REPLACE FUNCTION clinical.encounter_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
  allowed text[] := ARRAY['status', 'annulled_at', 'annulled_by', 'annul_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'ANNULLED' THEN
      RAISE EXCEPTION 'SGEE_IMMUTABLE: annulled encounter % cannot be modified', OLD.id USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'CLOSED' THEN
      IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) OR NEW.status NOT IN ('CLOSED', 'ANNULLED') THEN
        RAISE EXCEPTION 'SGEE_IMMUTABLE: closed encounter % can only be annulled (use addenda for corrections)', OLD.id USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.status = 'CLOSED' AND (TG_OP = 'INSERT' OR OLD.status <> 'CLOSED') THEN
    SELECT * INTO r FROM audit.chain_append('encounter:' || NEW.tenant_id::text, clinical.encounter_payload(NEW));
    NEW.prev_hash := r.prev_hash;
    NEW.hash := r.hash;
    NEW.seq := r.seq;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER encounter_guard BEFORE INSERT OR UPDATE ON clinical.encounters FOR EACH ROW EXECUTE FUNCTION clinical.encounter_guard();

CREATE OR REPLACE FUNCTION clinical.verify_encounter_chain(p_tenant uuid)
RETURNS TABLE (id uuid, seq bigint, hash_ok boolean, link_ok boolean)
LANGUAGE plpgsql STABLE AS $$
DECLARE e clinical.encounters; prev text := NULL;
BEGIN
  FOR e IN SELECT * FROM clinical.encounters x WHERE x.tenant_id = p_tenant AND x.seq IS NOT NULL ORDER BY x.seq LOOP
    id := e.id; seq := e.seq;
    link_ok := e.prev_hash IS NOT DISTINCT FROM prev;
    hash_ok := e.hash = encode(public.digest(coalesce(e.prev_hash, 'GENESIS') || '|' || clinical.encounter_payload(e), 'sha256'), 'hex');
    prev := e.hash;
    RETURN NEXT;
  END LOOP;
END $$;

-- children of a closed encounter are frozen
CREATE OR REPLACE FUNCTION clinical.encounter_child_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM clinical.encounters WHERE id = NEW.encounter_id;
  IF s IN ('CLOSED', 'ANNULLED') THEN
    RAISE EXCEPTION 'SGEE_IMMUTABLE: encounter % is % — record an addendum instead', NEW.encounter_id, s USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vital_signs_guard BEFORE INSERT OR UPDATE ON clinical.vital_signs FOR EACH ROW EXECUTE FUNCTION clinical.encounter_child_guard();
CREATE TRIGGER encounter_diagnoses_guard BEFORE INSERT OR UPDATE ON clinical.encounter_diagnoses FOR EACH ROW EXECUTE FUNCTION clinical.encounter_child_guard();
CREATE TRIGGER encounter_procedures_guard BEFORE INSERT OR UPDATE ON clinical.encounter_procedures FOR EACH ROW EXECUTE FUNCTION clinical.encounter_child_guard();
CREATE TRIGGER referrals_guard BEFORE INSERT OR UPDATE ON clinical.referrals FOR EACH ROW EXECUTE FUNCTION clinical.encounter_child_guard();
CREATE TRIGGER incident_reports_guard BEFORE INSERT OR UPDATE ON clinical.incident_reports FOR EACH ROW EXECUTE FUNCTION clinical.encounter_child_guard();

-- encounter notes / addenda (append-only, chained)
CREATE OR REPLACE FUNCTION clinical.encounter_note_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM audit.chain_append('encounter_note:' || NEW.tenant_id::text,
    concat_ws('|', NEW.id, NEW.encounter_id, NEW.kind, NEW.note, coalesce(NEW.author_id::text, ''), audit.ts(NEW.created_at)));
  NEW.prev_hash := r.prev_hash;
  NEW.hash := r.hash;
  RETURN NEW;
END $$;
CREATE TRIGGER encounter_note_hash BEFORE INSERT ON clinical.encounter_notes FOR EACH ROW EXECUTE FUNCTION clinical.encounter_note_hash();
CREATE TRIGGER encounter_note_immutable BEFORE UPDATE ON clinical.encounter_notes FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

-- medication administrations (append-only, chained)
CREATE OR REPLACE FUNCTION meds.administration_payload(a meds.medication_administrations) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws('|', a.id, a.tenant_id, a.request_id, coalesce(a.schedule_id::text, ''), a.student_id, audit.ts(a.administered_at),
    a.administered_by_user_id, coalesce(a.witness_user_id::text, ''), a.dose::text, a.dose_unit, a.route, a.outcome,
    coalesce(a.reason, ''), coalesce(a.adverse_effects, ''), a.verification::text)
$$;

CREATE OR REPLACE FUNCTION meds.administration_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM audit.chain_append('med_admin:' || NEW.tenant_id::text, meds.administration_payload(NEW));
  NEW.prev_hash := r.prev_hash;
  NEW.hash := r.hash;
  NEW.seq := r.seq;
  RETURN NEW;
END $$;
CREATE TRIGGER administration_hash BEFORE INSERT ON meds.medication_administrations FOR EACH ROW EXECUTE FUNCTION meds.administration_hash();
CREATE TRIGGER administration_immutable BEFORE UPDATE ON meds.medication_administrations FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

CREATE OR REPLACE FUNCTION meds.verify_administration_chain(p_tenant uuid)
RETURNS TABLE (id uuid, seq bigint, hash_ok boolean, link_ok boolean)
LANGUAGE plpgsql STABLE AS $$
DECLARE a meds.medication_administrations; prev text := NULL;
BEGIN
  FOR a IN SELECT * FROM meds.medication_administrations x WHERE x.tenant_id = p_tenant ORDER BY x.seq LOOP
    id := a.id; seq := a.seq;
    link_ok := a.prev_hash IS NOT DISTINCT FROM prev;
    hash_ok := a.hash = encode(public.digest(coalesce(a.prev_hash, 'GENESIS') || '|' || meds.administration_payload(a), 'sha256'), 'hex');
    prev := a.hash;
    RETURN NEXT;
  END LOOP;
END $$;

-- ── no DELETE on clinical / meds / audit ───────────────────────────────────
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('clinical', 'meds') LOOP
    EXECUTE format('CREATE TRIGGER no_delete BEFORE DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.forbid_change()', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── pass state machine in the database ─────────────────────────────────────
INSERT INTO flow.pass_transitions (from_state, to_state) VALUES
  ('REQUESTED', 'IN_TRANSIT'), ('REQUESTED', 'RECEIVED'), ('REQUESTED', 'CANCELLED'),
  ('IN_TRANSIT', 'RECEIVED'), ('IN_TRANSIT', 'CANCELLED'), ('IN_TRANSIT', 'EXPIRED'),
  ('RECEIVED', 'IN_CARE'), ('RECEIVED', 'CANCELLED'),
  ('IN_CARE', 'OBSERVATION'), ('IN_CARE', 'RETURNED_TO_CLASS'), ('IN_CARE', 'WAITING_GUARDIAN'), ('IN_CARE', 'TRANSFERRED_IPS'),
  ('OBSERVATION', 'IN_CARE'), ('OBSERVATION', 'RETURNED_TO_CLASS'), ('OBSERVATION', 'WAITING_GUARDIAN'), ('OBSERVATION', 'TRANSFERRED_IPS'),
  ('RETURNED_TO_CLASS', 'CLOSED'),
  ('WAITING_GUARDIAN', 'EXIT_AUTHORIZED'), ('WAITING_GUARDIAN', 'IN_CARE'), ('WAITING_GUARDIAN', 'TRANSFERRED_IPS'),
  ('EXIT_AUTHORIZED', 'HANDED_OVER'), ('EXIT_AUTHORIZED', 'WAITING_GUARDIAN'),
  ('HANDED_OVER', 'CLOSED'),
  ('TRANSFERRED_IPS', 'CLOSED')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION flow.pass_state_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT EXISTS (
    SELECT 1 FROM flow.pass_transitions t WHERE t.from_state = OLD.state AND t.to_state = NEW.state
  ) THEN
    RAISE EXCEPTION 'SGEE_INVALID_TRANSITION: % -> %', OLD.state, NEW.state USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pass_state_guard BEFORE UPDATE OF state ON flow.passes FOR EACH ROW EXECUTE FUNCTION flow.pass_state_guard();

-- ── CHECK constraints ──────────────────────────────────────────────────────
ALTER TABLE flow.passes
  ADD CONSTRAINT passes_state_chk CHECK (state IN ('REQUESTED','IN_TRANSIT','RECEIVED','IN_CARE','OBSERVATION','RETURNED_TO_CLASS','WAITING_GUARDIAN','EXIT_AUTHORIZED','HANDED_OVER','TRANSFERRED_IPS','CLOSED','CANCELLED','EXPIRED')),
  ADD CONSTRAINT passes_urgency_chk CHECK (urgency IN ('LOW','MEDIUM','HIGH','EMERGENCY'));
ALTER TABLE flow.exit_authorizations
  ADD CONSTRAINT exit_auth_status_chk CHECK (status IN ('PENDING_GUARDIAN','CONFIRMED','COMPLETED','CANCELLED','EXPIRED'));
ALTER TABLE flow.gate_checkouts ADD CONSTRAINT gate_method_chk CHECK (method IN ('QR','DOCUMENT','MANUAL'));
ALTER TABLE flow.standing_exit_permissions ADD CONSTRAINT standing_dates_chk CHECK (valid_to >= valid_from);

ALTER TABLE clinical.encounters
  ADD CONSTRAINT encounters_status_chk CHECK (status IN ('OPEN','OBSERVATION','CLOSED','ANNULLED')),
  ADD CONSTRAINT encounters_subject_chk CHECK (subject_type IN ('STUDENT','STAFF')),
  ADD CONSTRAINT encounters_annul_reason_chk CHECK (status <> 'ANNULLED' OR (annul_reason IS NOT NULL AND length(annul_reason) >= 10)),
  ADD CONSTRAINT encounters_dates_chk CHECK (ended_at IS NULL OR ended_at >= started_at),
  ADD CONSTRAINT encounters_closed_signed_chk CHECK (status <> 'CLOSED' OR is_historical OR signed_at IS NOT NULL);
ALTER TABLE clinical.allergies
  ADD CONSTRAINT allergies_severity_chk CHECK (severity IN ('MILD','MODERATE','SEVERE','ANAPHYLAXIS')),
  ADD CONSTRAINT allergies_category_chk CHECK (category IN ('MEDICATION','FOOD','ENVIRONMENTAL','INSECT','LATEX','OTHER'));
ALTER TABLE clinical.anthropometrics ADD CONSTRAINT anthropometrics_values_chk CHECK (weight_kg > 0 AND height_cm > 0);
ALTER TABLE clinical.vital_signs
  ADD CONSTRAINT vitals_ranges_chk CHECK (
    (temperature_c IS NULL OR temperature_c BETWEEN 30 AND 43) AND (heart_rate IS NULL OR heart_rate BETWEEN 20 AND 250) AND
    (respiratory_rate IS NULL OR respiratory_rate BETWEEN 4 AND 90) AND (spo2 IS NULL OR spo2 BETWEEN 50 AND 100) AND
    (pain_score IS NULL OR pain_score BETWEEN 0 AND 10) AND (glasgow IS NULL OR glasgow BETWEEN 3 AND 15));
ALTER TABLE clinical.absence_excuses ADD CONSTRAINT absence_dates_chk CHECK (to_date >= from_date);
ALTER TABLE clinical.campaigns ADD CONSTRAINT campaign_dates_chk CHECK (ends_on >= starts_on);
ALTER TABLE clinical.mental_health_notes ADD CONSTRAINT mh_risk_chk CHECK (risk_level IN ('NONE','LOW','MODERATE','HIGH'));

ALTER TABLE meds.medication_requests
  ADD CONSTRAINT medreq_dose_chk CHECK (dose > 0),
  ADD CONSTRAINT medreq_dates_chk CHECK (end_date >= start_date),
  ADD CONSTRAINT medreq_status_chk CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','ACTIVE','SUSPENDED','COMPLETED','CANCELLED')),
  ADD CONSTRAINT medreq_route_chk CHECK (route IN ('ORAL','SUBLINGUAL','BUCCAL','INHALED','NASAL','OPHTHALMIC','OTIC','TOPICAL','SUBCUTANEOUS','INTRAMUSCULAR','RECTAL','TRANSDERMAL'));
ALTER TABLE meds.medication_administrations
  ADD CONSTRAINT medadm_dose_chk CHECK (dose > 0),
  ADD CONSTRAINT medadm_outcome_chk CHECK (outcome IN ('GIVEN','REFUSED','OMITTED','HELD'));
ALTER TABLE meds.medication_custody
  ADD CONSTRAINT custody_qty_chk CHECK (quantity_received > 0 AND quantity_remaining >= 0);
ALTER TABLE meds.medication_schedule
  ADD CONSTRAINT schedule_status_chk CHECK (status IN ('PENDING','GIVEN','REFUSED','OMITTED','HELD','MISSED','CANCELLED'));

ALTER TABLE inventory.item_batches ADD CONSTRAINT batch_qty_chk CHECK (quantity >= 0);
ALTER TABLE inventory.items ADD CONSTRAINT items_kind_chk CHECK (kind IN ('MEDICATION','SUPPLY'));

ALTER TABLE comms.notifications
  ADD CONSTRAINT notifications_status_chk CHECK (status IN ('QUEUED','SENT','DELIVERED','READ','FAILED','SUPPRESSED')),
  ADD CONSTRAINT notifications_channel_chk CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP','SMS','PUSH'));
ALTER TABLE compliance.consents ADD CONSTRAINT consents_status_chk CHECK (status IN ('GRANTED','REVOKED','SUPERSEDED'));
ALTER TABLE core.user_roles ADD CONSTRAINT user_roles_role_chk CHECK (role IN ('SUPERADMIN','ADMIN','HEALTH_COORDINATOR','NURSE','DOCTOR','PSYCHOLOGIST','TEACHER','GATE','PARENT','DIRECTOR','STUDENT'));
ALTER TABLE people.persons ADD CONSTRAINT persons_kind_chk CHECK (kind IN ('STUDENT','GUARDIAN','STAFF','EXTERNAL'));

-- ── indexes ────────────────────────────────────────────────────────────────
CREATE INDEX persons_name_trgm_idx ON people.persons USING gin (core.f_unaccent(lower(first_name || ' ' || last_name)) gin_trgm_ops);
CREATE INDEX students_code_trgm_idx ON people.students USING gin (code gin_trgm_ops);
CREATE INDEX passes_open_idx ON flow.passes (tenant_id, state, requested_at) WHERE state NOT IN ('CLOSED','CANCELLED','EXPIRED');
CREATE INDEX encounters_open_idx ON clinical.encounters (tenant_id, started_at) WHERE status IN ('OPEN','OBSERVATION');
CREATE INDEX medreq_active_idx ON meds.medication_requests (tenant_id, student_id) WHERE status = 'ACTIVE';
CREATE INDEX schedule_pending_idx ON meds.medication_schedule (tenant_id, scheduled_for) WHERE status = 'PENDING';
CREATE INDEX batches_active_expiry_idx ON inventory.item_batches (tenant_id, expiry_date) WHERE status = 'ACTIVE' AND quantity > 0;
CREATE INDEX notifications_queued_idx ON comms.notifications (scheduled_for) WHERE status = 'QUEUED';
CREATE INDEX jobs_pending_idx ON integration.jobs (run_at) WHERE status = 'PENDING';
CREATE INDEX clinical_access_log_brin ON clinical.clinical_access_log USING brin (created_at);

-- ── stock levels view ──────────────────────────────────────────────────────
CREATE VIEW inventory.stock_levels WITH (security_invoker = true) AS
SELECT b.tenant_id, b.item_id, b.location_id, sum(b.quantity) AS quantity,
       min(b.expiry_date) FILTER (WHERE b.quantity > 0) AS next_expiry,
       count(*) FILTER (WHERE b.quantity > 0) AS active_batches
FROM inventory.item_batches b
WHERE b.status = 'ACTIVE'
GROUP BY b.tenant_id, b.item_id, b.location_id;

-- ── Row Level Security ─────────────────────────────────────────────────────
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema IN ('core','people','clinical','meds','inventory','flow','comms','compliance','audit','integration')
      AND NOT (c.table_schema = 'integration' AND c.table_name = 'jobs')
      AND c.table_name NOT LIKE 'audit_log_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.table_schema, r.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.table_schema, r.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (core.rls_bypass() OR tenant_id = core.current_tenant()) WITH CHECK (core.rls_bypass() OR tenant_id = core.current_tenant())', r.table_schema, r.table_name);
  END LOOP;
END $$;

ALTER TABLE core.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON core.tenants USING (core.rls_bypass() OR id = core.current_tenant()) WITH CHECK (core.rls_bypass());

-- ── SECURITY DEFINER lookups for unauthenticated entry points ──────────────
CREATE OR REPLACE FUNCTION core.login_candidates(p_email text)
RETURNS TABLE (user_id uuid, tenant_id uuid, tenant_slug text, tenant_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
  SELECT u.id, u.tenant_id, t.slug, t.name FROM core.users u JOIN core.tenants t ON t.id = u.tenant_id
  WHERE u.email = p_email::public.citext AND u.active AND t.active
$$;

CREATE OR REPLACE FUNCTION core.kiosk_candidate(p_slug text, p_device text)
RETURNS TABLE (user_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
  SELECT u.id, u.tenant_id FROM core.users u JOIN core.tenants t ON t.id = u.tenant_id
  WHERE t.slug = p_slug AND u.kiosk_device_code = p_device AND u.active AND t.active
$$;

CREATE OR REPLACE FUNCTION core.session_tenant(p_hash text)
RETURNS TABLE (session_id uuid, tenant_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
  SELECT s.id, s.tenant_id, s.user_id FROM core.sessions s WHERE s.refresh_token_hash = p_hash
$$;

CREATE OR REPLACE FUNCTION core.link_token_tenant(p_hash text)
RETURNS TABLE (token_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
  SELECT l.id, l.tenant_id FROM core.link_tokens l WHERE l.token_hash = p_hash
$$;

CREATE OR REPLACE FUNCTION core.invitation_tenant(p_code text)
RETURNS TABLE (invitation_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
  SELECT i.id, i.tenant_id FROM core.invitations i WHERE i.code = p_code
$$;

CREATE OR REPLACE FUNCTION core.tenant_by_slug(p_slug text)
RETURNS TABLE (tenant_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
  SELECT t.id, t.name FROM core.tenants t WHERE t.slug = p_slug AND t.active
$$;

-- ── reporting materialized views (tenant-filtered through views) ───────────
CREATE SCHEMA IF NOT EXISTS reporting;

CREATE MATERIALIZED VIEW reporting.mv_encounters_daily AS
SELECT e.tenant_id,
       (e.started_at AT TIME ZONE t.timezone)::date AS day,
       extract(hour FROM e.started_at AT TIME ZONE t.timezone)::int AS hour,
       e.subject_type, e.type,
       sec.id AS section_id, coalesce(sec.name, 'Sin sección') AS section_name,
       g.id AS grade_id, coalesce(g.name, '') AS grade_name,
       gr.id AS group_id, coalesce(gr.name, '') AS group_name,
       count(*)::int AS encounters,
       count(*) FILTER (WHERE e.disposition = 'GUARDIAN_PICKUP')::int AS pickups,
       count(*) FILTER (WHERE e.disposition = 'TRANSFER_IPS')::int AS transfers,
       count(DISTINCT e.person_id)::int AS people
FROM clinical.encounters e
JOIN core.tenants t ON t.id = e.tenant_id
LEFT JOIN people.students s ON s.id = e.student_id
LEFT JOIN core.groups gr ON gr.id = s.current_group_id
LEFT JOIN core.grades g ON g.id = gr.grade_id
LEFT JOIN core.sections sec ON sec.id = g.section_id
WHERE e.status <> 'ANNULLED'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;
CREATE INDEX mv_encounters_daily_idx ON reporting.mv_encounters_daily (tenant_id, day);

CREATE MATERIALIZED VIEW reporting.mv_pass_times AS
SELECT p.tenant_id, p.id AS pass_id, (p.requested_at AT TIME ZONE t.timezone)::date AS day,
       p.urgency, p.state, p.issued_by_user_id, s.current_group_id AS group_id,
       round(extract(epoch FROM (p.received_at - p.requested_at)) / 60.0, 1) AS transit_min,
       round(extract(epoch FROM (p.in_care_at - p.received_at)) / 60.0, 1) AS wait_min,
       round(extract(epoch FROM (coalesce(p.returned_at, p.waiting_guardian_at, p.transferred_at) - p.in_care_at)) / 60.0, 1) AS care_min,
       round(extract(epoch FROM (p.handed_over_at - p.waiting_guardian_at)) / 60.0, 1) AS pickup_min,
       round(extract(epoch FROM (coalesce(p.closed_at, p.handed_over_at, p.transferred_at, p.returned_at) - p.requested_at)) / 60.0, 1) AS total_min
FROM flow.passes p
JOIN core.tenants t ON t.id = p.tenant_id
JOIN people.students s ON s.id = p.student_id;
CREATE INDEX mv_pass_times_idx ON reporting.mv_pass_times (tenant_id, day);

CREATE MATERIALIZED VIEW reporting.mv_outbreak_signals AS
SELECT e.tenant_id, date_trunc('week', e.started_at AT TIME ZONE t.timezone)::date AS week,
       s.current_group_id AS group_id, gr.grade_id,
       coalesce(d.code, '') AS icd10_code, lower(e.chief_complaint) AS complaint,
       count(DISTINCT e.person_id)::int AS cases
FROM clinical.encounters e
JOIN core.tenants t ON t.id = e.tenant_id
JOIN people.students s ON s.id = e.student_id
LEFT JOIN core.groups gr ON gr.id = s.current_group_id
LEFT JOIN clinical.encounter_diagnoses d ON d.encounter_id = e.id AND d."primary"
WHERE e.status <> 'ANNULLED' AND e.started_at > now() - interval '120 days'
GROUP BY 1, 2, 3, 4, 5, 6;
CREATE INDEX mv_outbreak_signals_idx ON reporting.mv_outbreak_signals (tenant_id, week);

CREATE VIEW reporting.v_encounters_daily WITH (security_barrier = true) AS
  SELECT * FROM reporting.mv_encounters_daily WHERE core.rls_bypass() OR tenant_id = core.current_tenant();
CREATE VIEW reporting.v_pass_times WITH (security_barrier = true) AS
  SELECT * FROM reporting.mv_pass_times WHERE core.rls_bypass() OR tenant_id = core.current_tenant();
CREATE VIEW reporting.v_outbreak_signals WITH (security_barrier = true) AS
  SELECT * FROM reporting.mv_outbreak_signals WHERE core.rls_bypass() OR tenant_id = core.current_tenant();

CREATE OR REPLACE FUNCTION reporting.refresh_all() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, reporting AS $$
BEGIN
  REFRESH MATERIALIZED VIEW reporting.mv_encounters_daily;
  REFRESH MATERIALIZED VIEW reporting.mv_pass_times;
  REFRESH MATERIALIZED VIEW reporting.mv_outbreak_signals;
END $$;

-- ── grants for the application role ────────────────────────────────────────
GRANT USAGE ON SCHEMA core, people, clinical, meds, inventory, flow, comms, compliance, audit, integration, reporting TO sgee_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core, people, inventory, flow, comms, compliance, integration TO sgee_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA clinical, meds TO sgee_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA clinical, meds FROM sgee_app;
GRANT SELECT, INSERT ON audit.audit_log TO sgee_app;
REVOKE ALL ON audit.chain_heads FROM sgee_app;
REVOKE ALL ON reporting.mv_encounters_daily, reporting.mv_pass_times, reporting.mv_outbreak_signals FROM sgee_app;
GRANT SELECT ON reporting.v_encounters_daily, reporting.v_pass_times, reporting.v_outbreak_signals TO sgee_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, people, clinical, meds, inventory, flow, comms, compliance, audit, integration TO sgee_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core, clinical, meds, flow, reporting TO sgee_app;
GRANT EXECUTE ON FUNCTION audit.ensure_partitions(date, int), audit.chain_append(text, text), audit.ts(timestamptz) TO sgee_app;
REVOKE DELETE ON flow.pass_transitions FROM sgee_app;
REVOKE INSERT, UPDATE ON flow.pass_transitions FROM sgee_app;
