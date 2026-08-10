# MediFind Backend

REST API for **MediFind**, a Vietnamese medicine-lookup application. It serves drug information from an offline copy of the Vietnamese national drug registry (39,880 records), identifies medicines from photographs by forwarding them to an OCR service, and stores user accounts, medication reminders, and search history in MongoDB.

Built with Express 4 and Mongoose 8.

---

## Architecture

```
                        ┌──────────────────────────────┐
                        │   Client (MediFind app)      │
                        └──────────────┬───────────────┘
                                       │ HTTP :3000 (default)
                        ┌──────────────▼───────────────┐
                        │   This service (Express)     │
                        │   app.js       → routes      │
                        │   component.js → handlers    │
                        │   vie.json     → in-memory   │
                        └──┬─────────┬──────────────┬──┘
                           │         │              │
              ┌────────────▼──┐  ┌───▼──────────┐  ┌▼─────────────┐
              │ MongoDB Atlas │  │ Azure OCR    │  │ OpenAI       │
              │ users,        │  │ container    │  │ gpt-3.5-turbo│
              │ reminders     │  │ /process_img │  │              │
              └───────────────┘  └──────────────┘  └──────────────┘
```

The layout is deliberately flat — there is no `routes/` or `controllers/` split:

| File | Role |
|---|---|
| `app.js` | Loads env vars, connects to MongoDB, registers all 12 routes, listens on `PORT` (default 3000) |
| `component.js` | Every request handler, plus the multer upload config |
| `models/user.js` | `User` Mongoose schema |
| `models/reminder.js` | `Reminder` Mongoose schema |
| `vie.json` | Drug registry, 57 MB |

**Startup cost:** `component.js` reads and parses `vie.json` synchronously at require-time ([component.js:8](component.js#L8)), so the process blocks for roughly **230 ms** before it can serve the first request and peaks at about **319 MB** of resident memory, settling around **133 MB**. That peak is worth knowing when choosing a host — a 512 MB tier has little headroom.

Drug search is then a linear in-memory scan — no database index, no search engine. Measured at **5.5–6.8 ms** per request across all 39,880 records, so despite appearances this is not a bottleneck.

---

## Prerequisites

- **Node.js** — v18 or newer (developed and verified against v24.18.1)
- **MongoDB** — a MongoDB Atlas cluster or a local `mongod` instance
- **OpenAI API key** — only required for the `/api/v1/chatBot` endpoint

No Python is required. `requirements.txt` is a leftover from an earlier version — see [Known Issues](#known-issues--limitations).

---

## Setup

```bash
git clone git@github.com:hungnviet/Medifind-Backend.git
cd Medifind-Backend
npm install

cp .env.example .env
# then edit .env and fill in your own values
```

`.env`:

```
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
OPENAI_API_KEY=sk-...
```

`MONGO_URI` is required — the process exits with a setup hint if it is missing. `OPENAI_API_KEY` is only consulted when `/api/v1/chatBot` is called.

Start the server:

```bash
npm start
```

```
App running on port 3000...
Connected to MongoDB
```

The port defaults to `3000` and can be overridden with `PORT` ([app.js:48](app.js#L48)):

```bash
PORT=3100 npm start
```

The OCR service URL is still hardcoded ([component.js:87](component.js#L87)) and is not configurable.

---

## Testing

```bash
npm run smoke
```

**21 checks across all 12 endpoints, plus the error paths. The current baseline is 21/21.** It spawns `app.js` itself, so it can tell a failed request apart from a dead server — if the process exits, the case is reported as `CRASH`, the server is restarted, and the remaining checks still run.

Runs against a throwaway `medifind_smoke` database derived from `MONGO_URI`, and empties it afterwards, so a run never touches real data.

| Variable | Effect |
|---|---|
| `PORT` | Port for the spawned server, default `3000`. Set it if 3000 is occupied. |
| `SKIP_OCR=1` | Skips the `POST /nlp` happy path — the only check that calls the Azure OCR container. The missing-file check still runs, since it returns before any outbound request. |
| `OPENAI_API_KEY` | The `/chatBot` check is skipped unless this is a real key. When it is, the run makes a live, billed OpenAI call. |

```bash
PORT=3100 SKIP_OCR=1 npm run smoke
```

Without `SKIP_OCR`, `/nlp` retries once to absorb an OCR cold start.

There are no unit tests; this is the only automated coverage. A full verification run — including browser-reachability probes the smoke suite cannot perform, and a screen-by-screen readiness assessment against the frontend — is recorded in [docs/backend-readiness.md](docs/backend-readiness.md).

---

## API Reference

Base path: `http://localhost:3000/api/v1` (or whatever `PORT` is set to)

All 12 endpoints are unauthenticated. Where an endpoint operates on a user, the user's MongoDB `_id` is passed as a URL path parameter — see [Known Issues](#known-issues--limitations).

**Error handling.** Handlers are wrapped so a rejected promise can never reach the process as an unhandled rejection; anything unexpected returns `500 {"error": "Internal server error"}` and is logged. An id that is not a valid ObjectId returns the same `404` body that endpoint already uses for a missing record, rather than a distinct error — so callers need no new code path for malformed input.

### Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/drug/:name` | Search the drug registry by name |
| `GET` | `/chatBot` | Ask a question, proxied to OpenAI |
| `POST` | `/nlp` | Identify medicines from a photograph |
| `POST` | `/signup` | Create an account |
| `POST` | `/signin` | Log in |
| `POST` | `/reminder/:id` | Create a reminder for a user |
| `GET` | `/reminder/:id` | List a user's reminders |
| `PUT` | `/reminder/:reminderID/:userID` | Toggle a reminder's done state |
| `POST` | `/historySearch/:id` | Append to a user's search history |
| `GET` | `/historySearch/:id` | Read a user's search history |
| `GET` | `/historyMedicine/:id` | Read a user's medicine history |
| `POST` | `/historyMedicine/:id` | Append to a user's medicine history |

### The drug object

`GET /drug/:name` and `POST /nlp` both return the same projected shape, built from the registry's Vietnamese field names:

| Field | Vietnamese | Meaning |
|---|---|---|
| `ten` | tên thuốc | Drug name |
| `hoatChatChinh` | hoạt chất chính | Active ingredient |
| `SDK` | số đăng ký | Registration number |
| `SQD` | số quyết định | Approval decision number |
| `xuatSu` | nước sản xuất | Country of origin |
| `congTy` | tên công ty sản xuất | Manufacturer |
| `dangBaoChe` | dạng bào chế | Dosage form — **always absent, see Known Issues** |
| `diaChiSX` | địa chỉ sản xuất | Manufacturing address |

Any of these may be `null` when the source record lacks the corresponding nested object.

---

### `GET /api/v1/drug/:name`

Case-insensitive **substring** match against `tenThuoc` across all 39,880 records. **Returns at most 5 results**, taken in registry order — this is a hard cap, not pagination, and there is no way to request the next page.

```bash
curl "http://localhost:3000/api/v1/drug/paracetamol"
```

`200 OK`

```json
{
  "status": "success",
  "data": {
    "result": [
      {
        "ten": "Codupha - Paracetamol",
        "hoatChatChinh": "Paracetamol 500 mg",
        "SDK": "VD-13932-11",
        "SQD": "39/QĐ-QLD",
        "xuatSu": "Việt Nam",
        "congTy": "Công ty cổ phần dược TW Medipharco - Tenamyd",
        "diaChiSX": "Số 8 Nguyễn Trường Tộ, P. Phước Vĩnh, TP. Huế, Thừa Thiên Huế"
      }
    ]
  }
}
```

A query matching nothing returns `200` with `"result": []` — **not** a `404`.

---

### `GET /api/v1/chatBot`

Forwards `message` to OpenAI `gpt-3.5-turbo` (temperature `0.7`) and returns the reply. No system prompt, no conversation memory — each call is independent.

> **Note:** this is registered as a `GET` but reads its input from the **request body**. That is not merely unusual — Node's built-in `fetch` refuses outright (`Request with GET/HEAD method cannot have body`), as do browsers, many proxies and caches. Reaching this endpoint requires a lower-level client such as `node:http` or `curl`.
>
> **It fails silently rather than erroring.** Called without a body — the only form a browser can send — `content.message` is `undefined`, so the handler forwards the literal string `"undefined"` to OpenAI and returns `200` with a confident reply to a question nobody asked, while billing the key:
>
> ```json
> { "status": "sccuess", "reply": { "reply": "Hello! How can I assist you today?" } }
> ```
>
> See [Known Issues](#known-issues--limitations).

Request body:

```json
{ "message": "Paracetamol dùng để làm gì?" }
```

`200 OK`

```json
{
  "status": "sccuess",
  "reply": { "reply": "Paracetamol là thuốc giảm đau, hạ sốt..." }
}
```

The `"sccuess"` typo and the doubly-nested `reply.reply` are both present in the current implementation; clients depend on them.

`500` — returned for any upstream failure, including a missing or invalid `OPENAI_API_KEY`:

```json
{ "error": "Error fetching data from OpenAI" }
```

---

### `POST /api/v1/nlp`

Accepts a photograph of medicine packaging as `multipart/form-data` under the field name **`file`**, forwards it to the Azure OCR container, and returns the medicines it identified. The upload is held in memory (`multer.memoryStorage()`), never written to disk.

```bash
curl -F "file=@smalltest.png" http://localhost:3000/api/v1/nlp
```

`200 OK` — a **bare array**, not wrapped in a `status` envelope like the other endpoints:

```json
[
  {
    "ten": "Sofosbuvir 400mg",
    "hoatChatChinh": "Sofosbuvir 400mg",
    "SDK": "QLĐB-774-19",
    "SQD": "304/QLD-ÐK",
    "xuatSu": "Việt Nam",
    "congTy": "Công ty cổ phần Dược Minh Hải",
    "diaChiSX": "322 Lý Văn Lâm, Phường 1, Tp. Cà Mau, Tỉnh Cà Mau"
  }
]
```

An empty array means the OCR ran but matched no known medicine.

**Cold starts:** the OCR container scales to zero when idle. The first request after a quiet period frequently fails while the container wakes, surfacing as the OCR service's status code passed straight through — typically `502` with `{"error": "Picture upload failed"}`. Retrying a few seconds later succeeds. There is no retry logic in this service, so clients should handle it.

`400` — `{"error": "No file uploaded"}` when the `file` field is absent.

`500` — `{"error": "An error occurred while processing the image"}` if the request never reached the OCR service.

---

### `POST /api/v1/signup`

Request body: `{ "name": "...", "email": "...", "password": "..." }`

`201 Created` — the full user document, **including the password in plaintext**:

```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "65c...",
      "name": "Khanh",
      "email": "khanh@example.com",
      "password": "hunter2",
      "historySearch": [],
      "historyMedicine": [],
      "__v": 0
    }
  }
}
```

- `422` — `{"error": "User already exists with that email"}`
- `400` — `{"status": "fail", "message": "<mongoose validation error>"}`

### `POST /api/v1/signin`

Request body: `{ "email": "...", "password": "..." }`

`200 OK` — note there is **no token**; `userID` is what subsequent requests use:

```json
{ "status": "success", "userID": "65c...", "name": "Khanh" }
```

- `422` — `{"error": "Please add email or password"}` when either field is missing
- `422` — `{"status": "fail", "error": "Invalid Email"}` when no such user exists
- `422` — `{"status": "fail", "error": "Invalid password"}` on a password mismatch

The two failure shapes differ, and "Invalid Email" versus "Invalid password" tells an attacker which emails are registered.

---

### `POST /api/v1/reminder/:id`

`:id` is the **user** `_id`. Creates a reminder that recurs every `period` days starting from the given date, initialised with `state: false`.

Request body:

```json
{
  "name": "Paracetamol",
  "amount": 2,
  "hour": 8,
  "minute": 30,
  "period": 1,
  "start_date": 15,
  "start_month": 3,
  "start_year": 2024
}
```

All eight fields are required by the schema. `201` returns `{ "status": "success", "data": { "reminder": { ... } } }`; `404` returns `{"error": "User not found"}`.

### `GET /api/v1/reminder/:id`

`:id` is the **user** `_id`. `200` returns `{ "status": "success", "data": { "reminders": [ ... ] } }`, or `404` `{"error": "User not found"}`.

### `PUT /api/v1/reminder/:reminderID/:userID`

**Toggles** `state` — it flips the current boolean and takes **no request body**. Sending the same request twice returns the reminder to its original state.

`200` returns the user's full reminder list after the toggle: `{ "status": "success", "data": { "reminders": [ ... ] } }`. `404` returns `{"error": "Reminder not found"}`.

Note that `:userID` is used only to select which list to return; it is never checked against the reminder's owner, so a reminder belonging to one user can be toggled while another user's list is returned.

---

### Search history

**`POST /api/v1/historySearch/:id`** — appends one entry. Body: `{ "name": "Paracetamol" }`. Duplicates are not filtered and entries are never evicted, so this array grows without bound.

**`GET /api/v1/historySearch/:id`** — reads the list.

Both return `{ "status": "success", "data": { "history": [ { "name": "...", "_id": "..." } ] } }`, or `404` `{"error": "User not found"}`.

### Medicine history

**`POST /api/v1/historyMedicine/:id`** — the request body is an **array**, spread into the user's existing list:

```json
[
  { "name": "Paracetamol", "date": 15, "month": 3, "year": 2024 }
]
```

Returns `200` `{ "status": "success" }` only — no `data` field, unlike every other write endpoint. Posting a bare object rather than an array will fail schema validation.

**`GET /api/v1/historyMedicine/:id`** — returns `{ "status": "success", "data": { "history": [ ... ] } }`.

---

## Data Model

### `User` — [models/user.js](models/user.js)

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique |
| `password` | String | required, **stored in plaintext** |
| `historySearch` | Array of `{ name }` | embedded subdocuments |
| `historyMedicine` | Array of `{ name, date, month, year }` | embedded subdocuments; date parts are separate Numbers, not a `Date` |

`historySearch` and `historyMedicine` are embedded on the user document, so they load with every `findById` — including on the sign-in path — and count against MongoDB's 16 MB document limit as they grow.

### `Reminder` — [models/reminder.js](models/reminder.js)

| Field | Type | Notes |
|---|---|---|
| `name` | String | required — the medicine name |
| `amount` | Number | required — dose count |
| `hour`, `minute` | Number | required — time of day |
| `state` | Boolean | required — taken / not taken |
| `period` | Number | required — repeat interval in days |
| `start_date`, `start_month`, `start_year` | Number | required |
| `user` | ObjectId | ref `User` |

Unlike the history arrays, reminders live in their own collection and reference the user by id.

---

## Drug Dataset

`vie.json` is a 57 MB JSON array of **39,880** records from the Vietnamese drug registry, committed directly to the repository. It is read-only — no endpoint writes to it.

Each record's top-level keys:

```
tenThuoc               drug name
soDangKy               registration number
thongTinDangKyThuoc    registration info (dates, decision number)
thongTinThuocCoBan     core drug info (active ingredient, dosage form, packaging)
congTySanXuat          manufacturer (name, address, country)
phanLoaiThuocEnum      classification code — 1=24,943  2=14,406  3=70  4=459  null=2
ghiChu                 notes — empty in all 39,880 records
isActive               active flag — true in all 39,880 records, so nothing to filter
id                     record id
```

**Field coverage**, measured across the full dataset — relevant when deciding what an endpoint can actually return:

| Field | Populated |
|---|---|
| `soDangKy` | 39,880 (100%) |
| `congTySanXuat.tenCongTySanXuat` | 39,880 (100%) |
| `thongTinThuocCoBan.dongGoi` (packaging) | 39,879 (100%) |
| `thongTinThuocCoBan.hoatChatChinh` | 39,879 (100%) |
| `thongTinThuocCoBan.dangBaoChe` (dosage form) | 33,518 (84.0%) |
| `thongTinThuocCoBan.hamLuong` (strength) | 20,496 (51.4%) |
| `thongTinDangKyThuoc.dangBaoChe` — *what the handlers read* | **0 (0.0%)** |
| `thongTinThuocCoBan.nhomThuoc` (drug group) | **0 distinct values** |
| `ghiChu`, `tenDuongDung`, `loaiThuoc` | **0 (0.0%)** |

There is **no therapeutic category data** — `nhomThuoc` is empty throughout and `phanLoaiThuocEnum` is a coarse four-value regulatory code, not a therapeutic classification. Any category-based browsing has to be derived or curated elsewhere.

---

## Known Issues & Limitations

Documented as they stand today. None of these are fixed by this README. Items marked **verified** were reproduced against a running server during the readiness run — see [docs/backend-readiness.md](docs/backend-readiness.md) for the commands and output.

### Security

- **Passwords are stored and compared in plaintext.** [component.js:161](component.js#L161) does `user.password === password`; there is no hashing anywhere. A database leak exposes every password directly.
- **`POST /signup` returns the password** in its response body ([component.js:143](component.js#L143)).
- **There is no authentication layer.** Sign-in returns a raw `userID` rather than a session or token, and every user-scoped endpoint takes that id from the URL path. Any caller who knows or guesses a MongoDB ObjectId can read and write that user's reminders and history. Nothing verifies that the caller is the user named in the path.
- **`PUT /reminder/:reminderID/:userID` does not check ownership** — the two ids are used independently ([component.js:195-211](component.js#L195-L211)). **Verified:** a second account, supplying only its own user id and another user's reminder id, changed that reminder and received `200`.
- **Sign-in distinguishes "Invalid Email" from "Invalid password"**, enabling account enumeration.
- **The OpenAI proxy is unauthenticated and unmetered.** `GET /chatBot` reaches a paid API with no auth and no rate limit, so anyone who can reach the host can spend the key.

### Correctness

- **`dangBaoChe` (dosage form) is always missing from API responses.** **Verified** — the field is absent from every response. Both handlers read it from `thongTinDangKyThuoc` ([component.js:30](component.js#L30) and [component.js:110](component.js#L110)), where it is populated in **0** of the 39,880 records; the value lives at `thongTinThuocCoBan.dangBaoChe`, populated in **33,518** (84%). The result is `undefined`, which `JSON.stringify` silently drops. Fixing it is a one-word change to the path in each handler.
- **The `404` branch in `getDrugWithName` is unreachable.** [component.js:16](component.js#L16) tests `if (!data)`, but `Array.prototype.filter` always returns an array — truthy even when empty. A search with no matches returns `200` and an empty list.
- **`GET /chatBot` reads `req.body`** ([component.js:48](component.js#L48)), so standards-compliant clients cannot call it, and calling it *without* a body returns `200` with a reply to the literal string `"undefined"` rather than an error. **Verified** both ways. Changing the route to `POST` would fix it, but breaks the existing frontend.
- **Search matches the drug name only, never the active ingredient.** [component.js:12-15](component.js#L12-L15) filters on `tenThuoc`. For `paracetamol`, 240 records match by name but **1,668** match by `hoatChatChinh` — so **1,429 relevant records are unreachable through the API**.
- **No `cors` middleware.** **Verified** — neither a simple request nor an `OPTIONS` preflight carries any `Access-Control-*` header, so no browser-based client can call this service. The preflight returns `200`, which looks healthy in a terminal and is still rejected by the browser.
- **Unknown routes return Express's HTML error page**, not JSON, so a client's `res.json()` throws `SyntaxError: Unexpected token '<'` instead of surfacing a clean `404`. There is no catch-all handler.
- **Response envelopes are inconsistent.** Most endpoints return `{status, data}`, but `/nlp` returns a bare array and `POST /historyMedicine` returns `{status}` with no `data`. Error shapes vary too — sometimes `{error}`, sometimes `{status, message}`, sometimes `{status, error}`.
- **`"sccuess"` typo** in the chatbot response ([component.js:68](component.js#L68)).
- **Search results are capped at 5** with no pagination, so a common substring silently hides most matches — 235 of the 240 `paracetamol` name matches, for instance.
- **`POST /reminder` silently discards unrecognised fields.** **Verified** — a body carrying extra keys returns `201 Created` with none of them persisted, because the schema has no place for them. Clients get a success response and lose data.
- **`multer` has no file size limit** ([component.js:78](component.js#L78)) and holds uploads in memory, so a large upload is bounded only by available RAM.

### Repository hygiene

- **`requirements.txt`** (`pyahocorasick`, `pymongo`) is left over from when OCR and matching ran in-process via `python-shell`. That work now lives in the Azure container; nothing in this repository installs or uses these packages.
- **`vie.json` is committed to git** at 57 MB, so every clone pays for it. `node_modules/` was tracked too and has since been removed from the index, but both remain in history — a clone still downloads them.
- **`node-fetch` is pinned to `^2.7.0`** and must stay there: v3 is ESM-only and cannot be `require`d from this CommonJS codebase. Node 18+ has a global `fetch`, so the dependency could be dropped entirely instead.
- **`"vercel-build": "echo hello"`** in `package.json` looks vestigial.
- **No unit tests.** `npm test` exits 1 by design; `npm run smoke` is the only automated coverage.

---

## Security Notice — old credentials, rotated

Until recently, a MongoDB Atlas connection string and an OpenAI API key were hardcoded in `app.js` and `component.js`. They were moved to environment variables, and **both have since been rotated** — verified during the readiness run:

- The OpenAI key in `.env` no longer matches the exposed `sk-tDOAuqRC…` prefix.
- The MongoDB credential differs from the one in git history, and now points at a **different cluster host** entirely.

The exposure is therefore closed. The old values remain in this repository's history and always will unless it is rewritten, but they are dead — rotation, not history rewriting, is what closed this. Rewriting with `git filter-repo` or BFG stays optional and would require every collaborator to re-clone.

Never commit the new values. `.env` is git-ignored; `.env.example` holds placeholders only.
