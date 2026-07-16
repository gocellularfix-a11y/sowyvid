# MediaVault Engine

A secure, local-first media library engine rebuilt from the useful ingestion, store, classification, and corpus-selection ideas in the legacy code.

## Improvements over the legacy implementation

- Copies bytes into managed storage instead of storing original absolute paths
- SHA-256 content IDs and duplicate detection
- Atomic metadata writes
- Magic-byte validation before storage
- EN/ES/PT deterministic classification
- License-gated catalog selection
- Abstract IDs in decisions; renderers resolve IDs to files
- No Electron, React, database, cloud, or AI dependencies
