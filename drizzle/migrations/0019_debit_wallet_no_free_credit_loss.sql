CREATE OR REPLACE FUNCTION public.debit_wallet(p_client_id uuid, p_amount numeric, p_description text DEFAULT ''::text, p_reference_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := p_amount;
  v_free_used numeric := 0;
  v_free_id uuid; v_free_rem numeric; v_take numeric;
  v_bal numeric; v_wallet_used numeric := 0; v_shortfall numeric;
BEGIN
  INSERT INTO public.client_wallets (client_id, balance) VALUES (p_client_id, 0) ON CONFLICT (client_id) DO NOTHING;
  SELECT balance INTO v_bal FROM public.client_wallets WHERE client_id = p_client_id FOR UPDATE;
  v_bal := COALESCE(v_bal, 0);

  FOR v_free_id, v_free_rem IN
    SELECT id, dollars_remaining FROM public.client_free_credits
    WHERE client_id = p_client_id AND expires_at > now() AND dollars_remaining > 0
    ORDER BY expires_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_free_rem, v_remaining);
    UPDATE public.client_free_credits SET dollars_remaining = dollars_remaining - v_take WHERE id = v_free_id;
    v_remaining := v_remaining - v_take;
    v_free_used := v_free_used + v_take;
  END LOOP;

  v_wallet_used := LEAST(GREATEST(v_bal, 0), GREATEST(v_remaining, 0));
  v_shortfall := GREATEST(v_remaining - v_wallet_used, 0);

  IF v_wallet_used > 0 THEN
    UPDATE public.client_wallets SET balance = balance - v_wallet_used, lifetime_debits = lifetime_debits + v_wallet_used
    WHERE client_id = p_client_id;
  END IF;
  v_bal := v_bal - v_wallet_used;

  IF v_free_used > 0 THEN
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -v_free_used, v_bal, p_description || ' (free credits)', p_reference_id,
            p_metadata || jsonb_build_object('free_credits_used', v_free_used));
  END IF;
  IF v_wallet_used > 0 THEN
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -v_wallet_used, v_bal, p_description || ' (purchased)', p_reference_id,
            p_metadata || jsonb_build_object('wallet_used', v_wallet_used));
  END IF;

  IF v_shortfall > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', v_bal,
                              'free_used', v_free_used, 'wallet_used', v_wallet_used, 'shortfall', v_shortfall);
  END IF;
  RETURN jsonb_build_object('success', true, 'balance', v_bal, 'free_used', v_free_used);
END;
$function$;

UPDATE public.wallet_transactions SET description = description || ' — Stripe $0 invoice; billed on in_1UKhteELyIQnr0qGWOhFVcil (Sep 28)'
WHERE reference_id = 'in_1UIWEfELyIQnr0qGpxPssDyE' AND description NOT LIKE '%billed on%';
UPDATE public.wallet_transactions SET description = description || ' — Stripe $0 invoice; billed on subscription invoice in_1ToFKyELyIQnr0qG1J6MIioL'
WHERE reference_id = 'in_1TXnFnELyIQnr0qGRuvJKjuH' AND description NOT LIKE '%billed on%';
UPDATE public.wallet_transactions SET description = description || ' — Stripe $0 invoice; $50 sits on open subscription invoice in_1ToFKlELyIQnr0qG31V2Adjs'
WHERE reference_id = 'in_1Ta1TRELyIQnr0qGRh3q4Y2T' AND description NOT LIKE '%sits on%';