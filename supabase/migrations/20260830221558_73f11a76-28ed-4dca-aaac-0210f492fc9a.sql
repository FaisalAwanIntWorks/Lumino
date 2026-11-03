REVOKE EXECUTE ON FUNCTION public.capture_client_access_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_client_subscription_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_client_access_alert() FROM anon, authenticated;