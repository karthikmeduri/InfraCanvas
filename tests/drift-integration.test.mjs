import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasTerraformResources,
  highestDriftSeverity,
  matchDriftFindings,
  normalizeTerraformAddress,
  parseTfwhyReport,
  providers,
} from "../dist/generator-test-bundle.mjs";

const realTfwhyShape = JSON.stringify({
  counts: {},
  errored: false,
  findings: [
    {
      severity: "CRITICAL",
      address: "aws_db_instance.reports",
      type: "aws_db_instance",
      action: "delete",
      title: "aws_db_instance.reports was DELETED outside of Terraform",
      detail: "The real object no longer exists.",
      stateful: true,
    },
    {
      severity: "MEDIUM",
      address: "module.network.aws_security_group.web[0]",
      type: "aws_security_group",
      action: "update",
      title: "aws_security_group.web was modified outside of Terraform",
      stateful: false,
    },
  ],
});

test("parses TFwhy drift JSON and preserves the stable report contract", () => {
  const report = parseTfwhyReport(realTfwhyShape);
  assert.equal(report.findings.length, 2);
  assert.equal(report.findings[0].severity, "CRITICAL");
  assert.equal(report.findings[0].stateful, true);
  assert.deepEqual(report.warnings, []);
});

test("rejects arbitrary JSON and unsupported severities", () => {
  assert.throws(() => parseTfwhyReport('{"hello":"world"}'), /findings array/);
  assert.throws(
    () => parseTfwhyReport('{"findings":[{"severity":"URGENT"}]}'),
    /unsupported severity/,
  );
});

test("normalizes modules and instance keys before matching canvas addresses", () => {
  assert.equal(
    normalizeTerraformAddress('module.app.module.network.aws_security_group.web["blue"]'),
    "aws_security_group.web",
  );

  const aws = providers.find((provider) => provider.id === "aws");
  assert.ok(aws);
  const nodes = [
    { id: "db", serviceId: "rds", x: 0, y: 0, values: { name: "reports" } },
    { id: "sg", serviceId: "security_group", x: 0, y: 0, values: { name: "web" } },
  ];
  const report = parseTfwhyReport(realTfwhyShape);
  const matches = matchDriftFindings(report, canvasTerraformResources(aws, nodes));
  assert.deepEqual(matches.map((match) => match.nodeId), ["db", "sg"]);
  assert.equal(highestDriftSeverity(matches.map((match) => match.finding)), "CRITICAL");
});

test("does not guess when multiple canvas resources share a finding type", () => {
  const report = parseTfwhyReport(JSON.stringify({
    findings: [{
      severity: "LOW",
      address: "aws_instance.renamed_elsewhere",
      type: "aws_instance",
      action: "update",
      title: "Instance drifted",
      stateful: false,
    }],
  }));
  const matches = matchDriftFindings(report, [
    { id: "one", type: "aws_instance", address: "aws_instance.one" },
    { id: "two", type: "aws_instance", address: "aws_instance.two" },
  ]);
  assert.equal(matches[0].nodeId, undefined);
});
