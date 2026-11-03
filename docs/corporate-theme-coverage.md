# Corporate theme coverage

The active company palette supplies surfaces, text, borders and accents for the
manager and employee shells, legacy employee and planning workspaces, wish
planning, handovers, messages, shared dialogs, date controls and the map. The
geographic map remains visible with a neutral rendering and tenant-coloured
markers. Text on the dark map uses the dark palette even in light mode.

These rules apply only when a non-original company theme is active. Original
SchichtFunk and demo defaults remain unchanged until a tenant theme is applied.
Danger and warning states keep their separate meanings; successful states retain
their labels when their colours are neutralised.

Browser regressions check a second custom palette as well as Secontec, original
theme restoration, visible text and logos, manager areas, dialogs, dates,
messages, wish planning, handovers, geographic map, light/dark and mobile.
The IONOS build runs these checks before deployment.

This does not prove that every conditional state, role, uploaded custom
background, assistive-technology combination or installed offline PWA is free
of legacy colours. The authenticated production view uses the deployed code,
so unpublished changes cannot be directly verified in that session; a final
review after deployment remains necessary.
