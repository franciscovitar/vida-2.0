# Health objective-only UX

Vida Salud is an objective, read-only personal-health surface.

## Active product inputs

- canonical Health metrics from the existing Health pipeline;
- normalized Health Rhythm Features;
- read-only Gym context;
- read-only Nutrition context.

The normal Salud experience does not collect subjective Energy / Rested / Soreness / Stress / Focus / Workout RPE / Unwell / Note fields.

Historical Health Check-in rows are not deleted by this change. They are prior evidence, not active runtime dependencies.

## Presentation

- `/salud`: current objective state, compact Readiness when calculable, recent trajectory, material changes, cross-domain context and progressively disclosed coverage/history.
- `/salud/sueno`: Sleep Score, objective sleep regularity and sleep metrics.
- `/salud/corazon`: cardiovascular/autonomic trends and oxygen context.
- `/salud/actividad`: activity, mobility and energy context.

## Score semantics

- missing/stale values never become zero;
- Readiness is shown numerically only when its objective core domains are calculable;
- Sleep Score consumes objective rhythm regularity when available;
- exact coverage gates use epsilon-safe weight comparisons so decimal floating-point rounding cannot create false insufficiency;
- HRV remains optional;
- sleep regularity is not described as circadian alignment;
- all scores are wellness/trend summaries, not diagnosis or medical fitness clearance.
