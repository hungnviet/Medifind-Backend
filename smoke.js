// Smoke test for all API endpoints.
//
//   MONGO_URI=... npm run smoke
//
// Spawns app.js as a child process so it can detect the server dying, and
// points it at a throwaway `medifind_smoke` database that is dropped at the
// end. If the server dies mid-run the case is reported as CRASH and the
// server is restarted so the remaining checks still produce results.
require("dotenv").config();
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const mongoose = require("mongoose");

const PORT = 3000;
const BASE = `http://localhost:${PORT}/api/v1`;
const SMOKE_DB = "medifind_smoke";
const STARTUP_TIMEOUT_MS = 60000;

// Point the app at a dedicated database so a smoke run never touches real
// data. The app's own URI has no database name, which means it defaults to
// mongo's `test` db -- that is where production data lives.
function smokeUri(uri) {
    const [base, query] = uri.split("?");
    const trimmed = base.replace(/\/+$/, "");
    const schemeEnd = trimmed.indexOf("://") + 3;
    const rest = trimmed.slice(schemeEnd);
    const slash = rest.indexOf("/");
    const host = slash === -1 ? rest : rest.slice(0, slash);
    return `${trimmed.slice(0, schemeEnd)}${host}/${SMOKE_DB}${query ? `?${query}` : ""}`;
}

let child = null;
const results = [];

function serverAlive() {
    return child !== null && child.exitCode === null && child.signalCode === null;
}

function startServer(uri) {
    return new Promise((resolve, reject) => {
        child = spawn("node", ["app.js"], {
            cwd: __dirname,
            env: { ...process.env, MONGO_URI: uri },
        });
        let out = "";
        const onData = (buf) => {
            out += buf.toString();
            if (out.includes("App running")) {
                clearTimeout(timer);
                // Give the mongo connection a moment to settle.
                setTimeout(resolve, 1500);
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) => {
            if (!out.includes("App running")) {
                clearTimeout(timer);
                reject(new Error(`server exited early (code ${code}):\n${out}`));
            }
        });
        const timer = setTimeout(
            () => reject(new Error(`server did not start within ${STARTUP_TIMEOUT_MS}ms:\n${out}`)),
            STARTUP_TIMEOUT_MS
        );
    });
}

function stopServer() {
    if (serverAlive()) child.kill("SIGKILL");
    child = null;
}

// Returns { status, body } or { dead: true } if the request killed the server.
async function call(method, path, { json, form, timeout = 90000 } = {}) {
    const opts = { method, signal: AbortSignal.timeout(timeout) };
    if (json !== undefined) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(json);
    }
    if (form !== undefined) opts.body = form;

    try {
        const res = await fetch(`${BASE}${path}`, opts);
        const text = await res.text();
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
        return { status: res.status, body };
    } catch (err) {
        // A connection error usually means the process died. Give it a beat
        // to actually exit, then confirm before blaming the server.
        await new Promise((r) => setTimeout(r, 750));
        if (!serverAlive()) return { dead: true };
        return { status: 0, body: `request failed: ${err.message}` };
    }
}

// /chatBot is a GET that reads its body. Node's native fetch rejects that
// outright ("Request with GET/HEAD method cannot have body"), so the only way
// to exercise the endpoint as written is the lower-level http module.
function rawCall(method, path, json, timeout = 90000) {
    return new Promise((resolve) => {
        const payload = json === undefined ? null : JSON.stringify(json);
        const headers = payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {};
        const req = http.request(
            { hostname: "localhost", port: PORT, path: `/api/v1${path}`, method, headers, timeout },
            (res) => {
                let text = "";
                res.on("data", (d) => (text += d));
                res.on("end", () => {
                    let body;
                    try {
                        body = JSON.parse(text);
                    } catch {
                        body = text;
                    }
                    resolve({ status: res.statusCode, body });
                });
            }
        );
        req.on("timeout", () => req.destroy(new Error("timed out")));
        req.on("error", async (err) => {
            await new Promise((r) => setTimeout(r, 750));
            resolve(serverAlive() ? { status: 0, body: `request failed: ${err.message}` } : { dead: true });
        });
        if (payload) req.write(payload);
        req.end();
    });
}

function record(name, ok, detail) {
    results.push({ name, ok, detail });
    const tag = ok === "crash" ? "CRASH " : ok ? "  ok  " : " FAIL ";
    console.log(`[${tag}] ${name}${detail ? ` -- ${detail}` : ""}`);
}

// Runs one check; if the server died, records CRASH and restarts it.
async function check(name, fn, uri) {
    let res;
    try {
        res = await fn();
    } catch (err) {
        record(name, false, `threw: ${err.message}`);
        return null;
    }
    if (res && res.dead) {
        record(name, "crash", "server process exited");
        await startServer(uri);
        return null;
    }
    return res;
}

function expect(name, res, wantStatus, extra) {
    if (res === null) return; // already recorded as CRASH
    const okStatus = res.status === wantStatus;
    const extraMsg = okStatus && extra ? extra(res.body) : null;
    if (okStatus && !extraMsg) {
        record(name, true, `HTTP ${res.status}`);
    } else {
        record(name, false, okStatus ? extraMsg : `expected ${wantStatus}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 160)}`);
    }
}

async function main() {
    if (!process.env.MONGO_URI) {
        console.error("Missing MONGO_URI. Copy .env.example to .env and fill it in.");
        process.exit(1);
    }
    const uri = smokeUri(process.env.MONGO_URI);
    console.log(`Smoke database: ${SMOKE_DB}\n`);

    await startServer(uri);

    const email = `smoke-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
    const password = "smoke-password";
    let userID = null;
    let reminderID = null;

    // ---- drug search -------------------------------------------------
    expect(
        "GET /drug/:name returns matches, capped at 5",
        await check("GET /drug/:name", () => call("GET", "/drug/paracetamol"), uri),
        200,
        (b) => {
            if (b.status !== "success") return `expected status "success", got ${JSON.stringify(b.status)}`;
            const r = b.data && b.data.result;
            if (!Array.isArray(r)) return "data.result is not an array";
            if (r.length === 0) return "expected at least one match for paracetamol";
            if (r.length > 5) return `expected at most 5 results, got ${r.length}`;
            if (!("ten" in r[0]) || !("SDK" in r[0])) return `unexpected record shape: ${Object.keys(r[0]).join(",")}`;
            return null;
        }
    );

    expect(
        "GET /drug/:name with no match returns 200 + empty array",
        await check("GET /drug/:name no match", () => call("GET", "/drug/zzzznotadrug"), uri),
        200,
        (b) => (Array.isArray(b.data && b.data.result) && b.data.result.length === 0 ? null : `expected empty result, got ${JSON.stringify(b.data)}`)
    );

    // ---- chatbot -----------------------------------------------------
    // `sk-...` is the .env.example placeholder, not a usable key.
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey.startsWith("sk-") && openaiKey.length > 20) {
        expect(
            "GET /chatBot returns a reply",
            await check("GET /chatBot", () => rawCall("GET", "/chatBot", { message: "hello" }), uri),
            200,
            (b) => (b.reply && typeof b.reply.reply === "string" ? null : `unexpected shape: ${JSON.stringify(b).slice(0, 120)}`)
        );
    } else {
        record("GET /chatBot", true, "skipped (OPENAI_API_KEY not configured)");
    }

    // ---- OCR scan ----------------------------------------------------
    const scanForm = () => {
        const fd = new FormData();
        fd.append("file", new Blob([fs.readFileSync(`${__dirname}/smalltest.png`)]), "smalltest.png");
        return fd;
    };
    let scan = await check("POST /nlp", () => call("POST", "/nlp", { form: scanForm() }), uri);
    // The OCR container scales to zero; the first call after an idle period
    // often 502s while it wakes. Retry once before calling that a failure.
    if (scan && scan.status === 502) {
        console.log("       (OCR cold start, retrying once)");
        await new Promise((r) => setTimeout(r, 5000));
        scan = await check("POST /nlp", () => call("POST", "/nlp", { form: scanForm() }), uri);
    }
    expect("POST /nlp identifies medicine from image", scan, 200, (b) =>
        Array.isArray(b) ? null : `expected an array, got ${JSON.stringify(b).slice(0, 120)}`
    );

    // ---- CRASH CASE 1: upload with no file ---------------------------
    expect(
        "POST /nlp with no file does not kill the server",
        await check("POST /nlp no file", () => call("POST", "/nlp"), uri),
        400,
        (b) => (b && b.error ? null : `expected an error body, got ${JSON.stringify(b).slice(0, 120)}`)
    );

    // ---- auth --------------------------------------------------------
    const signup = await check("POST /signup", () => call("POST", "/signup", { json: { name: "Smoke", email, password } }), uri);
    expect("POST /signup creates a user", signup, 201, (b) => {
        const u = b.data && b.data.user;
        if (!u || !u._id) return `no user in response: ${JSON.stringify(b).slice(0, 120)}`;
        userID = u._id;
        return null;
    });

    expect(
        "POST /signup rejects a duplicate email",
        await check("POST /signup dup", () => call("POST", "/signup", { json: { name: "Smoke", email, password } }), uri),
        422
    );

    expect(
        "POST /signin succeeds with correct credentials",
        await check("POST /signin", () => call("POST", "/signin", { json: { email, password } }), uri),
        200,
        (b) => (b.status === "success" && b.userID ? null : `unexpected body: ${JSON.stringify(b).slice(0, 120)}`)
    );

    expect(
        "POST /signin rejects a wrong password",
        await check("POST /signin bad pw", () => call("POST", "/signin", { json: { email, password: "wrong" } }), uri),
        422
    );

    expect(
        "POST /signin rejects missing fields",
        await check("POST /signin empty", () => call("POST", "/signin", { json: {} }), uri),
        422
    );

    // ---- reminders ---------------------------------------------------
    if (userID) {
        const reminderBody = {
            name: "Paracetamol", amount: 2, hour: 8, minute: 30,
            period: 1, start_date: 15, start_month: 3, start_year: 2024,
        };
        const created = await check("POST /reminder/:id", () => call("POST", `/reminder/${userID}`, { json: reminderBody }), uri);
        expect("POST /reminder/:id creates a reminder", created, 201, (b) => {
            const r = b.data && b.data.reminder;
            if (!r || !r._id) return `no reminder in response: ${JSON.stringify(b).slice(0, 120)}`;
            if (r.state !== false) return `expected state false, got ${r.state}`;
            reminderID = r._id;
            return null;
        });

        // Not covered by an explicit guard -- this exercises the asyncHandler
        // backstop, which is what protects against unanticipated throws.
        expect(
            "POST /reminder/:id with an invalid body does not kill the server",
            await check("POST /reminder invalid body", () => call("POST", `/reminder/${userID}`, { json: {} }), uri),
            500,
            (b) => (b && b.error ? null : `expected an error body, got ${JSON.stringify(b).slice(0, 120)}`)
        );

        expect(
            "GET /reminder/:id lists reminders",
            await check("GET /reminder/:id", () => call("GET", `/reminder/${userID}`), uri),
            200,
            (b) => ((b.data && b.data.reminders || []).length === 1 ? null : `expected 1 reminder, got ${JSON.stringify(b.data).slice(0, 120)}`)
        );

        if (reminderID) {
            expect(
                "PUT /reminder/:reminderID/:userID toggles state",
                await check("PUT /reminder", () => call("PUT", `/reminder/${reminderID}/${userID}`), uri),
                200,
                (b) => {
                    const r = (b.data && b.data.reminders || [])[0];
                    return r && r.state === true ? null : `expected state to toggle to true, got ${r && r.state}`;
                }
            );
        }

        // ---- history ------------------------------------------------
        expect(
            "POST /historySearch/:id appends an entry",
            await check("POST /historySearch", () => call("POST", `/historySearch/${userID}`, { json: { name: "Paracetamol" } }), uri),
            200
        );
        expect(
            "GET /historySearch/:id reads entries",
            await check("GET /historySearch", () => call("GET", `/historySearch/${userID}`), uri),
            200,
            (b) => ((b.data && b.data.history || []).length === 1 ? null : `expected 1 entry, got ${JSON.stringify(b.data).slice(0, 120)}`)
        );
        expect(
            "POST /historyMedicine/:id appends entries",
            await check("POST /historyMedicine", () =>
                call("POST", `/historyMedicine/${userID}`, { json: [{ name: "Paracetamol", date: 15, month: 3, year: 2024 }] }), uri),
            200
        );
        expect(
            "GET /historyMedicine/:id reads entries",
            await check("GET /historyMedicine", () => call("GET", `/historyMedicine/${userID}`), uri),
            200,
            (b) => ((b.data && b.data.history || []).length === 1 ? null : `expected 1 entry, got ${JSON.stringify(b.data).slice(0, 120)}`)
        );
    } else {
        record("reminder + history checks", false, "skipped: signup did not yield a userID");
    }

    // ---- CRASH CASE 2: malformed ObjectId ----------------------------
    expect(
        "GET /reminder/:id with a malformed id does not kill the server",
        await check("GET /reminder malformed", () => call("GET", "/reminder/notanobjectid"), uri),
        404,
        (b) => (b && b.error ? null : `expected an error body, got ${JSON.stringify(b).slice(0, 120)}`)
    );
    expect(
        "GET /historySearch/:id with a malformed id does not kill the server",
        await check("GET /historySearch malformed", () => call("GET", "/historySearch/notanobjectid"), uri),
        404,
        (b) => (b && b.error ? null : `expected an error body, got ${JSON.stringify(b).slice(0, 120)}`)
    );
    expect(
        "GET /reminder/:id with a valid but unknown id returns 404",
        await check("GET /reminder unknown", () => call("GET", "/reminder/0123456789abcdef01234567"), uri),
        404
    );

    // ---- cleanup -----------------------------------------------------
    stopServer();
    // Empty the collections rather than dropping the database -- the Atlas
    // user does not have dropDatabase permission.
    await mongoose.connect(uri);
    for (const col of await mongoose.connection.db.collections()) {
        await col.deleteMany({});
    }
    await mongoose.disconnect();

    const failed = results.filter((r) => r.ok !== true);
    const crashed = results.filter((r) => r.ok === "crash");
    console.log(`\n${results.length - failed.length}/${results.length} passed` + (crashed.length ? `, ${crashed.length} CRASHED THE SERVER` : ""));
    if (failed.length) {
        console.log("\nNot passing:");
        for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
    console.error("\nSmoke run aborted:", err.message);
    stopServer();
    process.exit(1);
});
