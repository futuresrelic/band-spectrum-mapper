// Relocated to packages/shared so the server-side Headliner concert engine can
// use the exact same tier derivation this UI displays — see
// docs/proposals/HEADLINER_DATA_FLOW.md §4. Re-exported here so none of the
// existing imports of this path need to change.
export * from '@band-spectrum-mapper/shared';
