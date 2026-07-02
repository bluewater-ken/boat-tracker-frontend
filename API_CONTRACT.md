# Backend API Contract — Key Parts & Production Schedule redesign

> **Purpose:** The frontend has been built against the additions below. The backend lives on the
> separate server (Node/Express + PostgreSQL on the droplet), **not in this repo**, so it must be
> updated to match. Until then, the new fields render in the UI but won't persist across a page
> reload. Everything that works today keeps working — these are **additive** changes.
>
> Conventions: dates are `"YYYY-MM-DD"` strings (or `null`). Booleans default `false`. All new fields
> should be optional on `PUT` so existing calls keep working (partial updates).

---

## 1. Key Parts

### Data model additions (per part row)
Existing row: `{ boat_id, part_name, is_custom, status, ordered_at, received_at }`

Add:
| Field | Type | Meaning |
|-------|------|---------|
| `expected_delivery` | date \| null | Expected delivery date, set when a part is **Ordered**. Editable later (supplier changes promise). May be blank/unknown → UI shows `exp —`. |
| `actual_delivery` | date \| null | Actual delivery date, set when **Received**. Server defaults it to **today** on the transition to Received, but it stays **editable / back-datable**. |
| `flag_late` | bool | Manual "Late" flag (Ops can raise even before the due date). |
| `flag_backordered` | bool | Supplier-delayed. |
| `flag_unsatisfactory` | bool | Arrived wrong / damaged. |

### `GET /api/parts`
Return the five new fields on every row.

### `PUT /api/parts/:boatId/:partName`
Accept a **partial** body — any subset of:
```json
{
  "status": "Not Ordered | Ordered | Received",
  "is_custom": false,
  "expected_delivery": "2026-07-15",
  "actual_delivery": "2026-07-20",
  "flag_late": true,
  "flag_backordered": false,
  "flag_unsatisfactory": false
}
```
Only apply the keys present. When `status` transitions to `Received` and `actual_delivery` is not
supplied, default it to today (server date).

### Auto-Late (server = source of truth for reporting)
A part is Late when: `expected_delivery != null && status != 'Received' && today > expected_delivery`.
The frontend computes this too for display, but the server should compute/store it for reporting.
(Parts Ordered with a blank `expected_delivery` cannot auto-flag — manual only.)

### Permissions (LOCKED, BRD §6)
Key Parts is **view-only for Shop**; only **Ops** may change status, dates, or flags. Enforce with the
existing `requireRole('ops')` on the `PUT` route.

### History (for future reporting — not consumed by the frontend yet)
Store timestamped events for status changes, expected/actual date edits, and every flag raise/clear.

---

## 2. Production Schedule

### Data model additions (per boat row)
Add three boat-level flags (the standard set, BRD §8):
| Field | Type | Meaning |
|-------|------|---------|
| `flag_issue` | bool | Issue / Delay. |
| `flag_rework` | bool | Required Rework. |
| `flag_unsatisfactory` | bool | Unsatisfactory. |

### `GET /api/boats`
Return the three flag fields on every boat row.

### `PUT /api/schedule/:boatId`
Accept a **partial** body — any subset of:
```json
{
  "global_status": "Glass Shop",
  "flag_issue": true,
  "flag_rework": false,
  "flag_unsatisfactory": false
}
```

### Step Back (date memory, BRD §7 pattern)
Step Back is a normal `PUT /api/schedule/:boatId { "global_status": "<previous status>" }`. On a
**backward** move, the server should **restore that status's original timestamp** from STATUS_HISTORY
(date memory) rather than stamp today. A subsequent forward move re-stamps with today.

### Permissions (BRD §9c)
Both **Shop and Ops** may Advance, Step Back, and set flags. **Reorder** (`PUT /api/schedule/reorder`)
stays **Ops-only** — enforce `requireRole('ops')` there.

---

## Summary for the server developer
1. Add 5 columns to the parts table; return them in `GET /api/parts`; accept them in the parts `PUT`;
   default `actual_delivery` to today on Received; compute/store auto-Late; keep history.
2. Add 3 flag columns to the boats/schedule data; return them in `GET /api/boats`; accept them in the
   schedule `PUT`; implement step-back date restoration.
3. Enforce roles: parts `PUT` = Ops-only; schedule reorder = Ops-only; schedule status/flags = Ops+Shop.
