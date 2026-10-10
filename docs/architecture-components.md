# Versioned architecture components

The Component Registry turns a proven section of a diagram into a reusable, configurable building
block without turning it into an opaque black box. The initial release is a complete local-first
workflow for capture, versioning, package exchange, configuration, and insertion.

## Create a component

1. Select two or more resources on the canvas. Only connections whose source and destination are
   both selected are included.
2. Open **Components** in the top navigation and choose **Capture selection**.
3. Give the component a stable name, semantic version, description, and release note.
4. Select the catalog fields consumers may configure. InfraCanvas derives each input's string,
   number, boolean, or enum contract from the service definition.
5. Save the version. Existing versions cannot be changed or replaced.

To release an update, select the existing component, choose **New version**, and enter a greater
semantic version. Earlier versions remain available to insert and export.

## Use a component

Choose a component and version, set its exposed values, then select **Add component to canvas**.
InfraCanvas validates the input contract and creates new node and edge identifiers at the center of
the current viewport. The inserted resources are ordinary canvas resources: inspect, reconnect,
move, delete, and generate Terraform or Pulumi from them as usual.

Components are provider-specific. An AWS component can be reviewed while another provider is open,
but it can only be inserted into an AWS canvas.

## Exchange packages

**Export package** downloads the selected component and all of its immutable versions as JSON.
**Import package** accepts a package only after schema, catalog, graph, bounds, integrity, and size
validation. A duplicate version is accepted only when its digest is identical; conflicting content
under the same semantic version is rejected.

## Security and privacy boundary

- Capture allowlists provider catalog fields and strips credential-shaped keys and values.
- Only selected nodes and their internal edges are packaged. External architecture context is not.
- Imports are limited to 1 MB and treated as untrusted data.
- Versions carry deterministic integrity digests. These are integrity checks, not signatures.
- Packages and the library remain in browser `localStorage`; InfraCanvas does not upload them.
- Imported component values still require normal architecture, policy, plan, and security review.

The local registry does not provide team synchronization, access control, trusted publisher
identity, cryptographic signing, provenance attestations, revocation, or organization-wide policy
enforcement. Those controls are required before a hosted organization registry can be described as
production-ready.
