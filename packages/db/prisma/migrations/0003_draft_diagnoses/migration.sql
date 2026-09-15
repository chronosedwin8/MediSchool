-- 0003 — Diagnoses of an encounter can be replaced while it is still open
-- (autosave of the nursing form). Once closed/annulled they are immutable.

CREATE OR REPLACE FUNCTION clinical.forbid_delete_unless_open() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM clinical.encounters WHERE id = OLD.encounter_id;
  IF s IN ('OPEN', 'OBSERVATION') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'SGEE_IMMUTABLE: DELETE on %.% is not allowed for a % encounter', TG_TABLE_SCHEMA, TG_TABLE_NAME, s USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS no_delete ON clinical.encounter_diagnoses;
CREATE TRIGGER no_delete BEFORE DELETE ON clinical.encounter_diagnoses FOR EACH ROW EXECUTE FUNCTION clinical.forbid_delete_unless_open();
GRANT DELETE ON clinical.encounter_diagnoses TO sgee_app;
