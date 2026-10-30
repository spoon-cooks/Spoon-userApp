# Cook Pool — backend changes still to make

The Cook Pool screens (Figma `cCQlzTeiObQkpVBzwI8mZi`: `844:5842`, `719:1507`, `848:7605`,
`755:2333`, `848:6318`, `848:6611`, `719:1568`, `848:7494`, `848:7809`) are built against mock data
in `src/features/cookPool/data.ts`. This is what the backend (V0, Node — never the Go repo) has to
add before they can go live. Checked against V0 branch `feat/cook-pool-recurring-plans` @ `2eec25a`.

## What already exists

| Endpoint | Used for |
| --- | --- |
| `GET /v1/me/cooks` | The pool, newest first: `{ data: { cooks: PoolMember[], count } }` |
| `POST /v1/me/cooks` | Add a cook, keyed by `{ bookingId, source }` and an `Idempotency-Key` |
| `DELETE /v1/me/cooks/:cookId` | Remove a cook (204; 404 `RESOURCE_NOT_FOUND`) |
| `GET /v1/recurring/eligibility` | `poolCount`, `unlockThreshold`, `unlocked` |

## What the screens need

The app draws every list below in the order it arrives and adds no copy of its own to a cook, so
the backend controls content and order. Field names here are suggestions; the shapes are what the
screens read (`src/features/cookPool/types.ts`).

### 1. The deck — cooks who have served the household (new)

`GET /v1/me/cooks/candidates` — every cook who has completed a booking for the household, in the
pool or not, in the order the deck should show them (product decision: "only cooks who served
you"). The deck loops through them and never runs out, so pooled cooks stay in it; each item's
`inPool` says which. Each item is a cook profile, as in §2.

### 2. A cook's profile (new)

`GET /v1/me/cooks/:cookId/profile` — for any cook who has served the household, in the pool or
not (the profile is also opened from Home and from a booking's assigned cook).

```jsonc
{
  "cookId": "…",
  "name": "Cook Sanchita",          // the header title
  "shortName": "Sanchita",          // the pool grid's caption
  "photoUrl": "https://…",
  "details": [                      // caption lines under the name, in order
    { "id": "region", "label": "Region", "value": "West Bengal" }
  ],
  "stats": [                        // emphasised lines, in order
    { "id": "visits", "label": "No. of visits", "value": "45" },
    { "id": "rating", "label": "Rating", "value": "4.5", "icon": "star" }
  ],
  "menu": [                         // sections, in order
    {
      "id": "veg-curries",
      "title": "Curries/ sabzis- Veg",
      "dishes": [{ "id": "dahi_bhindi", "name": "Dahi bhindi", "imageUrl": "https://…" }]
    }
  ],
  "inPool": true
}
```

- `icon` is a key; the app knows `star` and draws nothing for a key it does not know.
- **Missing today:** dish images (`specialtyDishes` has `dishKey`, `label`, `dietCategory`,
  `displayOrder` but no image), menu section titles, and the visit count (no field anywhere).
- `GET /v1/me/cooks` should return `shortName` and `photoUrl` per member, which the landing grid
  needs; `PoolCookCard` has `displayName` and `profileImageUrl` already.

### 3. Adding from the deck

`POST /v1/me/cooks` is keyed by a `bookingId`, but a swipe on the deck adds a **cook**. Either
accept `{ cookId, source: "pool_deck" }` (validating that the cook has served the household) or
return a `bookingId` with each candidate so the app can send it. A new `source` value is needed
either way.

### 4. Skip and undo — nothing needed

A left swipe takes no action on the cook (design note), so skip and undo stay on the device. The
deck loops: every cook, skipped or added, goes to the back and comes round again in the same
session. If product later wants skips remembered, that is a new
`POST /v1/me/cooks/:cookId/skip` and its undo.

### 5. Dish likes — done (V0 DEC-115)

The dish card's heart (`848:7809`) is saved per household: a dish liked on one cook is liked on
every cook who cooks it (owner, 30 Oct 2026). Keyed by the dish library code the profile's shelves
send (`dishCode`).

- `GET /v1/me/dish-likes` → `{ dishCodes: string[] }`
- `PUT /v1/me/dish-likes/:dishCode` and `DELETE /v1/me/dish-likes/:dishCode`, both idempotent.
- The app fills the heart at once, puts it back if the request fails, and sends taps in order
  (`useSetDishLike`). The dev preview keeps its hearts in memory (`favourites.ts`).

### 6. Pool minimum

The landing keeps empty "Add" places until the pool reaches its minimum. The design says **2**;
`GET /v1/recurring/eligibility` defaults `unlockThreshold` to **3**. One number needs agreeing,
and the pool read should return it (`minimumSize`) so the landing does not read the recurring
eligibility for it. There is no maximum pool size in either the design or the backend.

## Wiring it in the app

Each hook in `src/features/cookPool/data.ts` becomes a `useApiQuery`, and each action
(`addCook`, `removeCook`) a mutation that invalidates the pool, candidates
and profile reads. Then remove the file from `ALLOWED_PENDING` in
`src/__tests__/productionDataPath.test.ts` and close `BE-COOKPOOL` in
`docs/BACKEND_INTEGRATION_MAP.md`. The screens don't change.
