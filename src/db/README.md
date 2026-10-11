# src/db

Drizzle schema, migrations and repositories.

**Import rules**

- May import from `src/core` (domain types) and `src/services`. Never from `src/features` or `src/ui`.
- Table names are `snake_case` plural. Validate JSON columns with zod at the boundary.
