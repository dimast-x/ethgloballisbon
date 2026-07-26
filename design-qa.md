# Governor controls design QA

- Source visual truth: `role-separation-audit/08-members-reference.png`
- Implementation screenshot: `role-separation-audit/07-suppliers-consistent.png`
- Combined comparison: `role-separation-audit/09-members-suppliers-side-by-side.png`
- Viewport: 1280 × 720 CSS px
- Source pixels: 1280 × 720
- Implementation pixels: 1280 × 720
- Device pixel ratio: 2
- Density normalization: both captures came from the same browser, viewport, and
  density; the combined comparison crops equivalent content regions without
  resizing them.
- State: populated Governor Controls panels with two active records and the
  corresponding add-record form.

## Full-view comparison

The Members panel is the visual source. The Suppliers implementation now uses
the same heading hierarchy, section label, bordered list rows, status pills,
muted secondary metadata, destructive access action, and attached pale add form.
The combined comparison shows both panels at the same scale.

## Focused comparison

The records and add forms were kept readable in the combined crop, so a separate
detail crop was unnecessary. The comparison covers the densest surfaces:
badges, metadata columns, inputs, primary actions, destructive actions, borders,
row rhythm, and form attachment.

## Required fidelity surfaces

- Fonts and typography: same inherited Geist families, heading sizes, uppercase
  kickers, small labels, weights, and muted metadata treatment.
- Spacing and layout rhythm: matching section spacing, row borders and heights,
  compact status placement, attached add form, 8 px outer radii, and 12–16 px
  inner spacing.
- Colors and tokens: both panels use the existing paper, panel, line, green,
  green-soft, orange-soft, ink, and ink-soft tokens.
- Image quality and assets: neither panel requires imagery. Existing Lucide
  action icons are retained; no replacement assets were introduced.
- Copy and content: Suppliers uses supplier-specific labels while retaining the
  Members panel's information hierarchy. Members now exposes Human or Agent as
  the allocation type.

## Interaction and console checks

- Member and supplier inputs, checkboxes, and action buttons rendered with
  accessible names.
- Supplier removal retains the last-active-supplier guard in production code.
- Browser console errors checked: none.
- No mutation was submitted during visual QA.

## Comparison history

1. Initial finding: Suppliers placed its add form above a visually unrelated,
   taller registry-card design, while Members used compact rows with an attached
   add form. Severity: P2.
2. Fix: Suppliers was rebuilt on the Members allocation-manager structure and
   token set; the add form moved below the list and actions/statuses were aligned.
3. Post-fix evidence: the combined comparison shows no remaining actionable
   P0, P1, or P2 difference. Supplier-only facts use additional columns by
   design without changing the visual system.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

No P3 polish is required for this scoped consistency pass.

final result: passed
