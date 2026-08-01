# Device Action manual unlock E2E evidence

This evidence set was captured by
`e2e/device-manual-unlock-real-os.spec.ts` against a real local Uni-Lab OS
runtime.

The sequence covers:

1. detecting a busy Action from `GET /api/v1/devices`;
2. exposing the holder and manual-unlock affordance in the existing device UI;
3. requiring explicit physical-safety confirmation;
4. sending the CAS-protected `force_unlock` command;
5. refetching the authoritative catalog until the Action is free; and
6. scheduling the same Action again to verify post-unlock reuse.

`network-ledger.json` records the browser-visible health, catalog, and command
requests. The command body contains the holder returned by the catalog and is
asserted verbatim by the E2E test.

These screenshots demonstrate logical lock recovery. They do not prove that a
physical device has stopped; the operator confirmation remains mandatory.
