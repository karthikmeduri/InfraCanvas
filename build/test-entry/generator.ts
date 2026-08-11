/**
 * Bundle entry used by `npm test` so the Node test runner can exercise the
 * TypeScript generator without a framework-specific loader.
 */
export { providers, SAMPLE_ARCHITECTURES, SAMPLE_EDGES } from "../../lib/catalog/index";
export { defaultValues } from "../../lib/catalog/helpers";
export { generate } from "../../lib/terraform/generate";
export { generatePulumi } from "../../lib/pulumi/generate";
export { validateDiagram } from "../../lib/validate";
export { createZip } from "../../lib/zip";
export { diagramToSvg } from "../../lib/export-diagram";
export {
  canvasTerraformResources,
  highestDriftSeverity,
  matchDriftFindings,
  normalizeTerraformAddress,
  parseTfwhyReport,
} from "../../lib/drift";
