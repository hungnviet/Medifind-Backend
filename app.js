require("dotenv").config();
const express = require('express');
const multer = require('multer');
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
app.use(express.json())
// Browsers refuse every request to this service without these headers, which
// includes the frontend's `npm run web` preview. Expo Go on a device is
// unaffected either way -- CORS is a browser policy.
app.use(cors())
require("./models/user");
require("./models/reminder");
if (!process.env.MONGO_URI) {
    console.log("Missing MONGO_URI. Copy .env.example to .env and fill it in.");
    process.exit(1);
}
const mongourl = process.env.MONGO_URI
mongoose
    .connect(mongourl)
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((error) => {
        console.log("Error connecting to MongoDB", error);
    });

const { getDrugWithName, getReply, handleScan, upload, signUp, signIn, createReminder, getReminder, updateReminder, updateHistorySearch, getHistorySearch, getHistoryMedicine, postHistoryMedicine } = require("./component");
// Express 4 does not catch rejected promises from async handlers, and node
// terminates the process on an unhandled rejection. Without this, any throw
// inside a handler takes the whole server down.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app
    .route("/api/v1/drug/:name")
    .get(asyncHandler(getDrugWithName))
// GET is kept because existing callers use it, but it reads its input from the
// request body, which spec-compliant clients refuse to send on a GET -- React
// Native's fetch throws "Body not allowed for GET or HEAD requests". POST is
// the one the app can actually call.
app
    .route("/api/v1/chatBot")
    .get(asyncHandler(getReply))
    .post(asyncHandler(getReply))
app.post("/api/v1/nlp", upload.single('file'), asyncHandler(handleScan));
app.post("/api/v1/signup", asyncHandler(signUp));
app.post("/api/v1/signin", asyncHandler(signIn));
app.post("/api/v1/reminder/:id", asyncHandler(createReminder));
app.get("/api/v1/reminder/:id", asyncHandler(getReminder));
app.put("/api/v1/reminder/:reminderID/:userID", asyncHandler(updateReminder));
app.post("/api/v1/historySearch/:id", asyncHandler(updateHistorySearch));
app.get("/api/v1/historySearch/:id", asyncHandler(getHistorySearch));
app.get("/api/v1/historyMedicine/:id", asyncHandler(getHistoryMedicine));
app.post("/api/v1/historyMedicine/:id", asyncHandler(postHistoryMedicine));
// Must sit after every route and before the error handler. Without it Express
// serves its HTML error page for an unknown path, so a client's res.json()
// throws "Unexpected token '<'" instead of surfacing a clean 404.
app.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});
app.use((err, req, res, next) => {
    console.log("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`App running on port ${port}...`);
})
