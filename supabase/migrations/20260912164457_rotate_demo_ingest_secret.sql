-- Rotate only the hash used to authorize aggregate, anonymous demo metrics.
-- The matching plaintext is stored as a Supabase Edge Function secret.

update demo_metrics_private.demo_usage_ingest_secret
set secret_sha256 = decode('939cd7f9bd361e3eeb68a0b49280abcbe75ffedce87757fbe3216d3c1677a222', 'hex')
where singleton = true;
