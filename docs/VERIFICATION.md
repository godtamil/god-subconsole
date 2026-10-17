# Verification record

Verified locally on 17 October 2026 with Node.js 24.21 on Windows.

- 55 automated tests passed against isolated PostgreSQL-compatible memory storage and mocked hosting responses.
- TypeScript type check and Vite production build passed. Windows temporary-directory build failure was fixed by the project-local build wrapper.
- Tests cover resource percentages/units/unlimited/missing limits, authentication cookies, CSRF/origin checks, assignments, viewer mutation denial, owner MFA enforcement, invitations, upstream permission denial, unavailable resources, session revocation, file traversal/secret blocking, encrypted secrets, safe error text, unauthorized WebSockets, and public registration with no server grants.
- Read-only hosting calls verified the actual full server UUID, allocations and limits, current running resources, file browsing, no backup/schedule/subuser entries, and authenticated console output.
- Browser verification exercised responsive resource cards at desktop, 820px tablet, and 390px mobile, plus navigation and the full UUID clipboard action. The clipboard contained the full API UUID.
- The displayed custom join address is configured independently of assigned allocations. Custom DNS/port connectivity has not been verified.
- No live server mutations were performed. All automated mutation tests use mocks. Production infrastructure and SMTP were not configured/tested.

Final screenshots are stored alongside this file in `screenshots/`. Do not distribute local QA databases, runtime environments, or credentials.

- Free-hosting preparation adds six isolated tests for protected hosted setup, including concurrent submissions and one-owner enforcement. Render/Neon deployment is not verified because no hosting account is connected.
