# Backend readiness — verification run, 2026-08-10

A check of this backend before the Expo frontend at `../medifind-fe-v2` is wired to it.

Every claim below is backed by output from this run or by a cited line of source. Nothing here was
fixed — this is a verification pass, and the findings are recorded rather than repaired.

---

## Verdict

**The backend works. It is not yet ready for this frontend.**

All 21 smoke checks pass. Every endpoint responds, the crash regressions from the previous branch
are still fixed, MongoDB and OpenAI are both reachable with the current credentials, and `npm audit`
reports zero vulnerabilities. Against its own contract, this service is healthy.

Against *this frontend*, three things stand between here and a working integration:

1. **Two transport-level blockers** that no Node-based test can catch, because they only manifest in
   a browser: there is no CORS middleware, and `GET /chatBot` cannot be called by a spec-compliant
   client at all. The Expo **web preview** — the workflow the frontend README uses for fast
   iteration — is blocked on every request today.
2. **The API silently discards data the frontend sends.** `POST /reminder` returns `201 Created`
   while dropping five of the fields the reminder screen depends on. A wiring bug of this shape is
   invisible until someone notices the data never comes back.
3. **There is no authentication.** `userID` travels as a URL path parameter with nothing verifying
   the caller, and it is demonstrated below that one account can modify another's data. This is the
   single decision worth making *before* wiring rather than after, because it changes the signature
   of every user-scoped call.

Roughly **four of twelve endpoints** can serve the frontend close to as-is. The rest need either a
translation layer in the app or backend changes.

---

## How this was verified

| | |
|---|---|
| Node | v24.18.1 |
| Branch | `chore/stability-security-patch` |
| Database | isolated `medifind_smoke` on Atlas, emptied afterwards |
| Server | `PORT=3100` (3000 is held by an unrelated `next-server`) |
| External calls | MongoDB Atlas ✅, OpenAI ✅, Azure OCR ❌ *(declined — see Not verified)* |

```bash
PORT=3100 SKIP_OCR=1 npm run smoke
```

Dependencies all resolve at their declared versions: `dotenv` 16.6.1, `express` 4.22.2,
`multer` 1.4.5-lts.1, `mongoose` 8.24.2, `form-data` 4.0.6, `node-fetch` 2.7.0.
Atlas connected in 657 ms; write and drop both succeeded, so **the credentials in `.env` are
current** — the rotation the README's security notice asks for appears to have been done.

---

## Smoke results — 21 / 21 passed

| Check | Result |
|---|---|
| `GET /drug/:name` returns matches, capped at 5 | 200 |
| `GET /drug/:name` with no match → 200 + empty array | 200 |
| `GET /chatBot` returns a reply | 200 |
| `POST /nlp` identifies medicine from image | **skipped** |
| `POST /nlp` with no file does not kill the server | 400 |
| `POST /signup` creates a user | 201 |
| `POST /signup` rejects a duplicate email | 422 |
| `POST /signin` succeeds with correct credentials | 200 |
| `POST /signin` rejects a wrong password | 422 |
| `POST /signin` rejects missing fields | 422 |
| `POST /reminder/:id` creates a reminder | 201 |
| `POST /reminder/:id` with an invalid body does not kill the server | 500 |
| `GET /reminder/:id` lists reminders | 200 |
| `PUT /reminder/:reminderID/:userID` toggles state | 200 |
| `POST /historySearch/:id` appends an entry | 200 |
| `GET /historySearch/:id` reads entries | 200 |
| `POST /historyMedicine/:id` appends entries | 200 |
| `GET /historyMedicine/:id` reads entries | 200 |
| `GET /reminder/:id` with a malformed id does not kill the server | 404 |
| `GET /historySearch/:id` with a malformed id does not kill the server | 404 |
| `GET /reminder/:id` with a valid but unknown id → 404 | 404 |

Both crash regressions fixed on this branch are still fixed.

### Not verified

- **`POST /nlp` happy path** — the Azure OCR call was declined for this run, so the entire backend
  path behind the `/scan` screen is unverified. Its missing-file guard *was* exercised (400), since
  that returns before any outbound request. Re-run without `SKIP_OCR=1` to cover it.
- **`GET /chatBot` from a real device.** It was verified from Node and found uncallable (below).
  Whether React Native's `fetch` on a physical device is more permissive than the WHATWG spec was
  not tested and should be, before anyone assumes the chatbot works on device.

---

## Blockers before the frontend can call this at all

### 1. No CORS middleware — blocks the Expo web preview entirely

Neither a simple request nor a preflight carries a single `Access-Control-*` header:

```console
$ curl -D - -H "Origin: http://localhost:8081" localhost:3100/api/v1/drug/paracetamol
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8      ← no Access-Control-Allow-Origin

$ curl -D - -X OPTIONS -H "Origin: http://localhost:8081" \
       -H "Access-Control-Request-Method: POST" localhost:3100/api/v1/signin
HTTP/1.1 200 OK
Allow: POST                                        ← no Access-Control-Allow-Origin
```

The preflight returns `200`, which looks fine in a terminal and is rejected by a browser regardless,
because the permission header is absent. `npm run web` at `localhost:8081` cannot reach this server.
Expo Go on a physical device is unaffected — CORS is a browser policy.

### 2. `GET /chatBot` cannot be called correctly, and fails silently when called incorrectly

[`component.js:48`](../component.js#L48) reads `req.body` on a `GET`. Node's global `fetch`
implements the same WHATWG spec browsers do:

```console
A: GET with a body, the way the handler expects to be called
   rejected before the request was sent:
     TypeError: Request with GET/HEAD method cannot have body.

B: GET with no body, the only form a browser can send
   HTTP 200
   {"status":"sccuess","reply":{"reply":"Hello! How can I assist you today?"}}
```

Case B is the dangerous one. With no body, `content.message` is `undefined`, so the handler sends
the literal string `"undefined"` to OpenAI and returns `200` with a plausible-looking reply to a
question nobody asked — while billing the API key. It does not error. A frontend wired to it would
appear to work and be wrong.

The `"sccuess"` typo at [`component.js:68`](../component.js#L68) is visible in that response; any
frontend checking `status === "success"` will not match it.

### 3. Unknown routes return HTML, which crashes a frontend's JSON parse

There is no catch-all 404 handler, so Express's default HTML error page is returned:

```console
$ curl localhost:3100/api/v1/pharmacies
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
<!DOCTYPE html> … <pre>Cannot GET /api/v1/pharmacies</pre>

# what the frontend would experience:
res.json() threw -> SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Any typo'd URL surfaces as a parse error rather than a clean 404 — the failure mode that costs the
most debugging time when wiring.

### 4. Reachability from a device

`app.listen` binds all interfaces, so Expo Go can reach the dev machine — but **not** at `localhost`,
which on a phone means the phone itself. The app's API base URL must point at a LAN address:

```bash
ip -4 addr show scope global      # Linux
ipconfig                          # Windows
ipconfig getifaddr en0            # macOS
```

Use the resulting address, e.g. `http://<your-lan-ip>:3000/api/v1`. Both machines must be on the same
network — a Tailscale or VPN address works too if the phone is on the same tailnet.

Port 3000 was held by an unrelated `next-server` during this run, which is why it used 3100.

---

## Security findings, demonstrated live

These were run against the live server rather than inferred from reading the code.

**Passwords are stored and returned in plaintext.**

```
POST /signup → HTTP 201
response keys: name, email, password, historySearch, _id, historyMedicine, __v
password present in response body: true
value returned verbatim:            true
stored value === the plaintext sent: true   (16 chars — a bcrypt hash would be 60 and start "$2")
```

**Any account can modify any other account's data.** No endpoint checks ownership:

```
Alice's reminder 6a78c16be3ebb70d1e3b7d0c, state = false
Mallory PUT /reminder/<Alice's reminder>/<Mallory's own id> → HTTP 200
Alice's reminder state afterwards: true
```

Mallory supplied only her own user id and Alice's reminder id — both of which the frontend already
puts in URLs — and changed a record belonging to someone else. Every user-scoped route has this
shape ([`component.js:195-211`](../component.js#L195-L211)).

**Sign-in enables account enumeration**, returning different bodies for the two failure cases:

```
unknown email  → 422 {"status":"fail","error":"Invalid Email"}
wrong password → 422 {"status":"fail","error":"Invalid password"}
```

**The OpenAI proxy is unauthenticated and unmetered.** `GET /chatBot` reaches a paid API with no
auth and no rate limit; anyone who can reach the host can spend the key.

---

## Contract gap, screen by screen

What the backend can serve today, for each screen of the frontend.

| Screen | Endpoint | State |
|---|---|---|
| `/auth/register` | `POST /signup` | **Usable.** Map `fullName`→`name`; `confirmPassword`/`termsAccepted` are frontend-only. Never persist the returned `password`. |
| `/auth/login` | `POST /signin` | **Usable.** Returns `{status, userID, name}`. No token — `useSession` would have to store `userID` as the de-facto credential. |
| `/search` | `GET /drug/:name` | **Partial.** Vietnamese keys; hard cap of 5 with no pagination; name-only matching; no categories. See below. |
| `/scan` | `POST /nlp` | **Unverified**, and returns a bare array with Vietnamese keys. `totalQuantity`, `dosage`, `dosageUnit`, `note` have no source. |
| `/chatbot` | `GET /chatBot` | **Blocked** on web; unverified on device. See blocker 2. |
| `/reminder` | `POST`/`GET`/`PUT /reminder` | **Partial and lossy.** See below. |
| `/main` | derived from reminders | Inherits every reminder gap. The timeline needs an end date to know whether a dose is still scheduled; the model has `period` instead, whose semantics are undocumented. |
| `/history` | `GET`/`POST /historyMedicine` | **Largely unsupported.** Backend stores `{name, date, month, year}`; the screen needs diagnosis, doctor, hospital, department, fees, side effects, next appointment. |
| `/map` | — | **No endpoint.** Pharmacies are mock-only. |
| — | `GET`/`POST /historySearch` | Works, but no screen consumes it yet. |

### Reminders lose data silently

Sending the frontend's own `ReminderProps` shape returns `201 Created` and persists none of it:

```
sent endDate/dosageUnit/note/icon/category → HTTP 201
fields persisted: name, amount, hour, minute, state, period, start_date,
                  start_month, start_year, user, _id, __v
silently dropped: endDate, dosageUnit, note, icon, category
```

Beyond the dropped fields:

- **No DELETE endpoint.** `reminder.tsx` calls `removeTask`; there is nothing to call.
- **`PUT` flips one global boolean** on the reminder document. The frontend tracks taken-marks *per
  dose occurrence* (`marks: Record<id, boolean>`, with one reminder repeating daily across a range).
  The model cannot express "the 8 am dose on 21 March was taken" — only "this reminder is toggled".
- Field names differ throughout: `medicineName`/`name`, `dosage`/`amount`, `timeHour`/`hour`,
  `id` (number) / `_id` (ObjectId string).

### Search is narrower than the screen expects

The frontend matches on **name or active ingredient**;
[`component.js:12-15`](../component.js#L12-L15) filters on `tenThuoc` only:

| Query "paracetamol" | Records |
|---|---|
| matches in `tenThuoc` (what the API searches) | 240 |
| matches in `hoatChatChinh` (what the screen also wants) | 1,668 |
| **reachable only by ingredient — invisible to the API** | **1,429** |

And of the 240 name matches, the hard cap returns 5.

---

## Drug dataset findings — `vie.json`

39,880 records, 57 MB, parsed synchronously at require time
([`component.js:8`](../component.js#L8)).

**`dangBaoChe` is missing from every response, and the fix is a one-word path change.** Both handlers
read it from `thongTinDangKyThuoc`; it lives on `thongTinThuocCoBan`:

| Path | Populated |
|---|---|
| `thongTinDangKyThuoc.dangBaoChe` — read today | **0 / 39,880 (0.0%)** |
| `thongTinThuocCoBan.dangBaoChe` — where it actually is | 33,518 / 39,880 (84.0%) |

Live confirmation — the field is absent from the response entirely, because `JSON.stringify` drops
`undefined`:

```
fields actually returned: ten, hoatChatChinh, SDK, SQD, xuatSu, congTy, diaChiSX
dangBaoChe present: false
```

**Two corrections to assumptions worth recording**, since both would have led work in a wrong
direction:

- **`isActive` is `true` for all 39,880 records.** The README lists "withdrawn drugs are returned
  alongside current ones" as a known issue; in this dataset there are none to filter, so this is
  not a live problem.
- **There is no therapeutic category data.** `nhomThuoc` exists as a key but has **0** distinct
  non-empty values, and `phanLoaiThuocEnum` is a coarse 4-value regulatory enum
  (`1`=24,943, `2`=14,406, `3`=70, `4`=459, null=2) — not the six categories
  (`Pain & Fever`, `Antibiotics`, …) the Search screen browses by. Those categories would have to be
  derived or curated; the dataset cannot supply them.

**What the dataset *could* supply but doesn't expose today:**

| Frontend field | Candidate source | Coverage |
|---|---|---|
| `totalQuantity`, `dosageUnit` | `dongGoi` — e.g. `"Hộp 1 gói x 2 vỉ x 10 viên"` | 100% (needs parsing) |
| strength | `hamLuong` — e.g. `"4,2mg"` | 51.4% |
| dosage form | `dangBaoChe` — e.g. `"Viên nén"` | 84.0% |
| `note` | `ghiChu` | **0%** — empty throughout |
| `dosage` (how many to take) | — | Not in the dataset; it is a prescription decision |

---

## Measurements

| | |
|---|---|
| `npm audit` | **0 vulnerabilities** |
| Memory, peak during startup parse | ~319 MB (`VmHWM` 326,944 kB) |
| Memory, steady state | ~133 MB (`VmRSS` 135,988 kB) |
| `GET /drug/:name` latency | **5.5–6.8 ms** over 5 runs |
| Worst case (single-letter query) | 5.7–5.8 ms |

**The linear scan is not a problem.** Filtering all 39,880 records and lowercasing each name on every
request costs under 7 ms end to end, including HTTP. This was flagged as a risk going in; the
measurement says it isn't one, and it needs no optimisation for the Search screen to feel responsive.

**The memory profile is worth knowing before choosing a host.** A ~319 MB startup peak rules out
512 MB free tiers with little headroom. Separately, the vestigial `"vercel-build"` script in
`package.json` points at a target this cannot deploy to as written: `app.listen()` does not work on
Vercel's serverless functions, and a 57 MB data file in the bundle is a poor fit for them.

---

## Changes made during this run

Three edits, made only to allow verification. No behaviour was fixed.

1. [`app.js:48`](../app.js#L48) — `const port = process.env.PORT || 3000;` (3000 was occupied, and
   this is needed for any deployment regardless)
2. [`smoke.js:15`](../smoke.js#L15) — same, so the suite and the app it spawns agree
3. [`smoke.js`](../smoke.js) — `SKIP_OCR=1` gate on the OCR happy-path check only, matching the
   existing `OPENAI_API_KEY` guard. The missing-file crash check remains ungated.

The `medifind_smoke` database was emptied afterwards. The `next-server` on port 3000 was not touched.

---

## Recommended order of work

**1. Decide the auth shape now — before any wiring.** This is the one item that gets materially more
expensive later. `userID` is currently a URL path parameter on every user-scoped route, so moving to
a token changes the signature of every call the frontend is about to write.
`hooks/useSession.tsx` is already built around a token-shaped seam, so the frontend is ready for it.
Deciding now costs a design conversation; deciding after wiring costs a rewrite of every call site
plus a re-test of every screen. Hashing passwords and adding ownership checks belong to the same
piece of work.

**2. Clear the transport blockers.** Small, additive, and they unblock the web preview immediately:
`cors` middleware, `GET /chatBot` → `POST` (or accept both), a JSON catch-all 404, and a `multer`
file-size limit. The `dangBaoChe` path fix belongs here too — it is one word and restores a field to
84% of drug responses.

**3. Then close the contract gap**, guided by the screen-by-screen table: the reminder model's
missing fields, a DELETE endpoint, per-dose taken tracking, ingredient search, pagination beyond the
cap of 5, and one consistent response envelope. This is a redesign and deserves its own spec.

**4. Out of band:** the credentials exposed in git history still need rotating per the README's
security notice, independent of everything above. The `.env` values are current, but history is not.
