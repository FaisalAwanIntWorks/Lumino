do $$
begin
  if exists (select 1 from cron.job where jobname = 'monthly-client-report') then
    perform cron.unschedule('monthly-client-report');
    raise notice 'monthly-client-report cron job unscheduled';
  else
    raise notice 'monthly-client-report cron job not found — nothing to do';
  end if;
end;
$$;