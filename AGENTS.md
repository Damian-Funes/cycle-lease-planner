# Project rules
- Capacity calculations are pure shared functions; diagnoses persist a full calculation snapshot so later configuration edits do not rewrite recorded technical assessments.
- Budget deep links apply a Typical and client/deal links independently, including when starting a new budget, to preserve diagnostic handoffs.
- Travel authorization uses database triggers as the authority; shared route validation helpers only provide early UI feedback.
- Route accounting reuses the activity completion dialog through optional callbacks and required-result props; existing callers retain their behavior.
- Júlia integration is client-only: read existing Supabase call records and invoke the existing initiation function; never duplicate backend analysis or write call records from the browser.
- Share Júlia labels, transcript parsing and call queries across budget, deal and reporting views to keep their interpretation consistent.