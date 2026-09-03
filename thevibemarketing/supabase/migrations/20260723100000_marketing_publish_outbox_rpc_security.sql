-- Lock down publish-attempt RPC execution to backend service role only.
revoke all on function public.create_or_reuse_marketing_publish_attempt(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

revoke all on function public.claim_marketing_outbox_job(text, integer)
  from public, anon, authenticated;

revoke all on function public.release_expired_marketing_outbox_leases()
  from public, anon, authenticated;

grant execute on function public.create_or_reuse_marketing_publish_attempt(uuid, text, text, text, text, text, text)
  to service_role;

grant execute on function public.claim_marketing_outbox_job(text, integer)
  to service_role;

grant execute on function public.release_expired_marketing_outbox_leases()
  to service_role;
