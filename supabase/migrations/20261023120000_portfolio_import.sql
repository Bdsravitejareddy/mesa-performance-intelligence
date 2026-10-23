-- Members upload their own collected portfolio summary through the app, so inserts and updates run under their
-- session and the workspace policy.
grant insert, update on public.portfolio_items to authenticated;
