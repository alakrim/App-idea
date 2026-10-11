/**
 * Non-UI modules the app needs at startup, imported once so that Metro bundles them. The app root
 * imports this file for its side effect (`import '@/bootstrap';`), which keeps the extraction stack
 * out of the UI tree.
 */
export * from '@/services/extraction';
