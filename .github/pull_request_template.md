## What this changes

<!-- One or two sentences. -->

## User impact and lifecycle direction

<!-- Which part of prompt → diagram → IaC → state → drift does this improve? -->

- [ ] The change is labelled honestly as available, in progress, or planned
- [ ] New interactions are keyboard accessible and usable in light and dark themes
- [ ] AI, state, drift, credential, or deployment changes document their security boundary

## Checklist

- [ ] `npm run typecheck` is clean
- [ ] `npm run lint` is clean, with no new warnings
- [ ] `npm test` passes (including the `fmt -check` gate, if tofu/terraform is installed)

### If this adds or changes a cloud service

- [ ] The `emit` function uses the `lib/hcl.ts` helpers, not string concatenation
- [ ] Secure defaults: encryption on, public access blocked unless intentionally public
- [ ] Credentials are `sensitive = true` variables, never string literals
- [ ] Cross-resource references come from `c.ref` / `c.refList` with a variable fallback —
      no `null` placeholders
- [ ] Verified against the real provider schema:

```bash
npm run emit:terraform -- <provider>
cd dist/emitted/<provider> && tofu init -backend=false && tofu validate
```

<!-- Paste the validate output here. -->
