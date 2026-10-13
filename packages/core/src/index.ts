export * from './brand.js';
export * from './gate.js';
export * from './installfail.js';
export * from './shortcodes.js';
export * from './check.js';
export * from './launchers.js';
export * from './hospitality.js';
export * from './manifest.js';
export * from './steps.js';
export * from './report.js';
export * from './engine.js';
export * from './knownapps.js';
export * from './xapk.js';
export * from './listapps.js';
export * from './afterinstall.js';
export * from './abi.js';

/**
 * Η ΕΚΔΟΣΗ ΤΟΥ ΕΡΓΑΛΕΙΟΥ — ΤΗΝ ΓΡΑΦΕΙ ΤΟ `tools/set_version.py`, ΜΗΝ ΤΗΝ ΑΛΛΑΖΕΙΣ ΣΤΟ ΧΕΡΙ.
 *
 * Μέχρι τις 3/10/2026 έλεγε `'0.1.0'` ενώ η αληθινή έκδοση ήταν 1.26.10.02: ο έλεγχος
 * ενημέρωσης συγκρίνει ΑΥΤΟ με το `tool.version` του manifest, οπότε θα έβγαζε «νέα έκδοση»
 * για πάντα, σε κάθε άνοιγμα. Μια σταθερά που ξεχνιέται είναι χειρότερη από καμία.
 */
export const TOOL_VERSION = '1.26.10.13';
export { activationPayload, actionPayload, appTypeFor, bytesToGigabytes, mapCpuArch, newVisitorId, shouldPulse, TELEMETRY_APP_CODE, TELEMETRY_APP_NAME, TELEMETRY_SHORT_CODE, type TelemetryFace, type TelemetryFacts, type TelemetryHost, type TelemetryPayload } from './telemetry.js';
