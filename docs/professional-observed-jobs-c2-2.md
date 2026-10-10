# Professional Gate C2.2 â€” observed vacancies, skill mentions and entry barriers

**Target:** `vida-qa`, authenticated `/professional/mercado`. No Production merge or deploy in this increment.

## Authoritative evidence read on 2026-10-10

The registered Google Sheet **Job Search Market Evidence V1** (`1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k`) was read directly: 14 `Observations` from 2026-10-10, one corresponding `Weekly Summary` and one `Source Yield` row. All 14 `dedupe_key` values are distinct; **two** job URLs were already included in the _different purposive_ PAS sample on 2026-10-02, leaving **12 distinct URLs not in that historical selection**. There are **not 34 independent fresh postings**.

This was a manually advanced, selectively sourced sample of mixed geography, job-board freshness and seniority, **not the 2026-10-12 scheduled Monday execution** and not reproducibly sampled week-over-week. The job-board URLs are traceability to visible listings; not every employer's ATS open/closed state was confirmed. Some postings are old. Never label all fourteen as newly opened current opportunities.

The source of truth remains Google Sheets; the new `data/generated/professional-observed-jobs-c2.json` is a **read-only derivative** generated from an observed and bounded Sheet snapshot (source ID and date included). No Sheets reads from the browser; no new evidence authority, cron, secrets, paid services or job submissions. Next research scan must dedupe against exist¶»§q«^