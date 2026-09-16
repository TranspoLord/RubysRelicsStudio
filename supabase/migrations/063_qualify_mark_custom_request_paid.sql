-- -----------------------------------------------------------------------------
-- Migration 063: Schema-qualify exp_mark_custom_request_paid
--
-- Migration 050 created this trigger with SET search_path = '' but an unqualified
-- reference to exp_custom_requests. With an empty search_path, unqualified names
-- no longer resolve to the public schema, so the trigger would error at runtime.
-- Re-create it with a schema-qualified reference, otherwise byte-identical to 050.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION exp_mark_custom_request_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payment_status = 'paid'
     AND OLD.payment_status <> 'paid'
     AND NEW.custom_request_id IS NOT NULL
  THEN
    UPDATE public.exp_custom_requests
      SET status = 'paid',
          updated_at = now()
      WHERE id = NEW.custom_request_id
        AND status IN ('quote_sent', 'awaiting_quote');
  END IF;

  RETURN NEW;
END;
$$;
