require("dotenv").config();
const express = require('express');
const multer = require('multer');
const mongoose = require("mongoose");
const app = express();
app.use(express.json())
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
app
    .route("/api/v1/chatBot")
    .get(asyncHandler(getReply))
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
app.use((err, req, res, next) => {
    console.log("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
});
const port = 3000;
app.listen(port, () => {
    console.log(`App running on port ${port}...`);
})
