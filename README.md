# MediFind Backend

REST API for **MediFind**, a Vietnamese medicine-lookup application. It serves drug information from an offline copy of the Vietnamese national drug registry (39,880 records), identifies medicines from photographs by forwarding them to an OCR service, and stores user accounts, medication reminders, and search history in MongoDB.

Built with Express 4 and Mongoose 8.

---

## Architecture

```
                        ┌──────────────────────────────┐
                        │   Client (MediFind app)      │
                        └──────────────┬───────────────┘
                                       │ HTTP :3000
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
| `app.js` | Loads env vars, connects to MongoDB, registers all 12 routes, listens on port 3000 |
| `component.js` | Every request handler, plus the multer upload config |
| `models/user.js` | `User` Mongoose schema |
| `models/reminder.js` | `Reminder` Mongoose schema |
| `vie.json` | Drug registry, 57 MB |

**Startup cost:** `component.js` reads and parses `vie.json` synchronously at require-time ([component.js:11](component.js#L11)), so the process allocates roughly 57 MB and blocks for a moment before it can serve the first request. Drug search is then a linear in-memory scan — there is no database index or search engine involved.

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

The port is hardcoded to `3000` ([app.js:43](app.js#L43)), as is the OCR service URL ([component.js:87](component.js#L87)); neither is configurable via environment variables.

---

## API Reference

Base path: `http://localhost:3000/api/v1`

All 12 endpoints are unauthenticated. Where an endpoint operates on a user, the user's MongoDB `_id` is passed as a URL path parameter — see [Known Issues](#known-issues--limitations).

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

> **Note:** this is registered as a `GET` but reads its input from the **request body**. Many HTTP clients and proxies drop bodies on GET requests. See [Known Issues](#known-issues--limitations).

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
phanLoaiThuocEnum      classification code
ghiChu                 notes
isActive               active flag — note: not filtered on by any endpoint
id                     record id
```

---

## Known Issues & Limitations

Documented as they stand today. None of these are fixed by this README.

### Security

- **Passwords are stored and compared in plaintext.** [component.js:161](component.js#L161) does `user.password === password`; there is no hashing anywhere. A database leak exposes every password directly.
- **`POST /signup` returns the password** in its response body ([component.js:143](component.js#L143)).
- **There is no authentication layer.** Sign-in returns a raw `userID` rather than a session or token, and every user-scoped endpoint takes that id from the URL path. Any caller who knows or guesses a MongoDB ObjectId can read and write that user's reminders and history. Nothing verifies that the caller is the user named in the path.
- **`PUT /reminder/:reminderID/:userID` does not check ownership** — the two ids are used independently ([component.js:189-202](component.js#L189-L202)).
- **Sign-in distinguishes "Invalid Email" from "Invalid password"**, enabling account enumeration.

### Correctness

- **`dangBaoChe` (dosage form) is always missing from API responses.** Both handlers read it from `thongTinDangKyThuoc` ([component.js:33](component.js#L33) and [component.js:110](component.js#L110)), but that object has no such key in any of the 39,880 records — the value actually lives at `thongTinThuocCoBan.dangBaoChe`, which is populated for 33,518 of them. The result is `undefined`, which `JSON.stringify` silently drops, so the field never appears in a response at all. Fixing it is a one-word change to the path in each handler.
- **The `404` branch in `getDrugWithName` is unreachable.** [component.js:19](component.js#L19) tests `if (!data)`, but `Array.prototype.filter` always returns an array — truthy even when empty. A search with no matches returns `200` and an empty list.
- **`GET /chatBot` reads `req.body`** ([component.js:51](component.js#L51)). GET requests with bodies are not reliably transmitted by HTTP clients, proxies, or caches.
- **Response envelopes are inconsistent.** Most endpoints return `{status, data}`, but `/nlp` returns a bare array and `POST /historyMedicine` returns `{status}` with no `data`. Error shapes vary too — sometimes `{error}`, sometimes `{status, message}`, sometimes `{status, error}`.
- **`"sccuess"` typo** in the chatbot response ([component.js:71](component.js#L71)).
- **Search results are capped at 5** with no pagination, so a common substring silently hides most matches.
- **`isActive` is never filtered on**, so withdrawn drugs are returned alongside current ones.

### Repository hygiene

- **`form-data` and `node-fetch` are `require`d but not declared** in `package.json` ([component.js:6-7](component.js#L6-L7)). They resolve today only because they are transitive dependencies of `openai` and `multer` — a dependency bump could break the app with no change to this repo.
- **Unused dependencies:** `openai` (the chatbot calls the REST endpoint with raw `fetch` instead of the SDK), `python-shell`, `uuid`, `debug`, and `mongodb` (Mongoose brings its own driver).
- **`requirements.txt`** (`pyahocorasick`, `pymongo`) is left over from when OCR and matching ran in-process via `python-shell`. That work now lives in the Azure container; nothing in this repository installs or uses these packages.
- **`node_modules/` and `vie.json` are committed to git.** A `.gitignore` now excludes `node_modules/` from future additions, but the already-tracked copies remain in history and in the index; untracking them is a separate cleanup.
- **`smalltest.png`** is a sample medicine photo used for exercising `POST /api/v1/nlp`.
- **No tests.** `npm test` exits 1 by design.

---

## Security Notice — rotate the old credentials

Until recently, a MongoDB Atlas connection string and an OpenAI API key were hardcoded in `app.js` and `component.js`. They have been moved to environment variables, **but both remain in this repository's git history and must be treated as compromised.**

If you maintain this project:

1. **Revoke the exposed OpenAI key** (`sk-tDOAuqRC…`) at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and issue a new one.
2. **Rotate the `medifind` MongoDB Atlas user's password**, and review the cluster's network access rules while you are there.
3. Rewriting history with `git filter-repo` or BFG is optional and requires every collaborator to re-clone. **Rotation is what actually closes the exposure** — do that first, regardless.

Never commit the new values. `.env` is git-ignored; `.env.example` holds placeholders only.
