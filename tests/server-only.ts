// Next's server-only package intentionally throws when imported in a browser
// bundle. Vitest runs server component tests in jsdom, so this is a harmless
// marker module for the test environment only.
