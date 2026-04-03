# Production List

## Replica Reconciliation

- The Tavus reconciliation flow now computes global onboarding impact before an admin hides or replaces a stored replica.
- Impact is measured against all saved team onboarding configs, not just the admin's current workspace.
- The metric counts affected organizations plus how many CTO and team assignments still reference the stored `replica_id`.
- Settings shows this as a one-line warning under destructive actions so admins know they may be hiding a face that is still assigned elsewhere.
- Replica removal is implemented as a soft deactivation in the catalog so existing saved assignments keep resolving while admins reconcile changes.
