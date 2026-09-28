# Study Engine -> FreshEvidence bridge

Study Engine evidence does not create a second mastery system. A real subject attempt is normalized into the existing Learning OS `FreshEvidence` schema and is accepted only when its concept maps exactly to the live `ConceptInventory`.

## Mapping

The adapter preserves the existing 18-column order:

`timestamp, subject_id, assessment, concept_id, activity_id, source, operation, score, correct, seen_before, independent, delayed_days, confidence, minutes, error_type, variant_family, notes, evidence_id`

Study Engine-specific rules:

- `source=study_engine`;
- `subject_id` and `assessment` come from the exact live ConceptInventory row, not from guessed parsing;
- `concept_id` uses facet first when present, otherwise the attempt concept;
- familiar work stays `freshness=familiar`;
- `independent=true` only for independent work;
- raw learner answers are never copied into FreshEvidence notes;
- `evidence_id=study-engine:<attempt-id>` makes retry/read-back idempotent;
- same evidence ID + different payload is a conflict and never overwrites history.

## Safe write path

Vida uses the existing Google service-account authentication and a dedicated private spreadsheet identifier:

```text
GOOGLE_LEARNING_SPREADSHEET_ID
GOOGLE_LEARNING_SHEETS_ALLOW_WRITES=true
```

The spreadsheet ID is never hardcoded in GitHub.

Vida's repository-wide safety contract forbids structural/append endpoints, so this bridge deliberately uses:

1. read exact headers and current bounded rows;
2. find the existing `evidence_id`;
3. write one free A:R row through the existing `PUT values` pattern;
4. read back by `evidence_id` before reporting success.

That is slightly more conservative than the Learning OS policy's preferred append call, but preserves the stronger existing Vida Safe Writes invariant.

## Fail-closed behavior

A real subject attempt is not promoted to Learning OS evidence when:

- the dedicated Sheet is not configured/writable;
- ConceptInventory/FreshEvidence headers do not match;
- the concept is absent;
- subject identity disagrees with the ConceptInventory mapping;
- the evidence ID already exists with different content;
- write/read-back fails.

The attempt still remains in the durable Study Engine attempt store. Real subject practice must not be declared fully Learning-OS-integrated until the Production Sheet configuration and service-account permission are verified.

## Current mapping coverage

The live Anki AI Bridge ConceptInventory currently contains DSI P2/P3 mappings. Other active subjects remain fail-closed for concept evidence until their canonical mappings are promoted to the live bridge. This is intentional: the catalog may show all seven subjects before every subject is evidence-write-ready.
