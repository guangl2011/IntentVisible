-- Audit immutability (spec: "DB triggers reject UPDATE/DELETE on audit tables").
-- The audit trail is append-only: corrections happen as new rows, never as
-- edits. These triggers enforce that at the database layer so no application
-- bug, migration, or manual session can silently rewrite history.

CREATE OR REPLACE FUNCTION reject_intentaudit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IntentAudit is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intentaudit_no_update
BEFORE UPDATE ON "IntentAudit"
FOR EACH ROW EXECUTE FUNCTION reject_intentaudit_mutation();

CREATE TRIGGER intentaudit_no_delete
BEFORE DELETE ON "IntentAudit"
FOR EACH ROW EXECUTE FUNCTION reject_intentaudit_mutation();

CREATE TRIGGER intentaudit_no_truncate
BEFORE TRUNCATE ON "IntentAudit"
FOR EACH STATEMENT EXECUTE FUNCTION reject_intentaudit_mutation();
