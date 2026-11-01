---
name: ucas-design-system
description: Design and review Arabic RTL, premium visual components, responsive CSS, focus management and accessibility for UCAS.
---
# Workflow

1. Inspect existing styles.css and the relevant page markup before proposing a new component.
2. Reuse existing CSS variables, color modes, navigation patterns and role/aria attributes.
3. Design mobile first and verify at 320, 360, 390, 430, 768 and desktop widths. Do not create document-level horizontal overflow.
4. Keep keyboard-focus indicators, logical RTL ordering, readable contrast and reduced-motion support.
5. Reuse template escaping for user-supplied text. Avoid decorative motion that disrupts reading.
6. Run npm run check and npm run test:browser where available, then document screenshot/viewport evidence and remaining limitations.

Deliver: design tokens used, files changed, accessibility evidence and browser-test results.
