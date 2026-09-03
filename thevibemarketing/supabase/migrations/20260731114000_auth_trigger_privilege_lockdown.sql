-- Trigger functions do not need client EXECUTE privileges. Keep this
-- SECURITY DEFINER function callable only by its owner through the trigger.
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;
