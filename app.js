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
    .connect(mongourl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((error) => {
        console.log("Error connecting to MongoDB", error);
    });

const { getDrugWithName, getReply, handleScan, upload, signUp, signIn, createReminder, getReminder, updateReminder, updateHistorySearch, getHistorySearch, getHistoryMedicine, postHistoryMedicine } = require("./component");
app
    .route("/api/v1/drug/:name")
    .get(getDrugWithName)
app
    .route("/api/v1/chatBot")
    .get(getReply)
app.post("/api/v1/nlp", upload.single('file'), handleScan);
app.post("/api/v1/signup", signUp);
app.post("/api/v1/signin", signIn);
app.post("/api/v1/reminder/:id", createReminder);
app.get("/api/v1/reminder/:id", getReminder);
app.put("/api/v1/reminder/:reminderID/:userID", updateReminder);
app.post("/api/v1/historySearch/:id", updateHistorySearch);
app.get("/api/v1/historySearch/:id", getHistorySearch);
app.get("/api/v1/historyMedicine/:id", getHistoryMedicine);
app.post("/api/v1/historyMedicine/:id", postHistoryMedicine);
const port = 3000;
app.listen(port, () => {
    console.log(`App running on port ${port}...`);
})
