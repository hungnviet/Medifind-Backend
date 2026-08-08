const multer = require('multer');
const mongoose = require("mongoose");
const User = mongoose.model("User");
const Reminder = mongoose.model("Reminder");
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const list = JSON.parse(fs.readFileSync(`${__dirname}/vie.json`));
const getDrugWithName = (req, res) => {
    const name = req.params.name;

    const data = list.filter((el) => {
        const nameInList = el.tenThuoc.toLowerCase();
        return nameInList.includes(name.toLowerCase());
    })
    if (!data) {
        res.status(404).json({ status: "fail", message: "No drug found with this name" });
        return;
    }
    const result = [];
    const count = data.length > 5 ? 5 : data.length;
    for (let i = 0; i < count; i++) {
        const inforPobs = {
            ten: data[i].tenThuoc,
            hoatChatChinh: data[i].thongTinThuocCoBan ? data[i].thongTinThuocCoBan.hoatChatChinh : null,
            SDK: data[i].soDangKy,
            SQD: data[i].thongTinDangKyThuoc ? data[i].thongTinDangKyThuoc.soQuyetDinh : null,
            xuatSu: data[i].congTySanXuat ? data[i].congTySanXuat.nuocSanXuat : null,
            congTy: data[i].congTySanXuat ? data[i].congTySanXuat.tenCongTySanXuat : null,
            dangBaoChe: data[i].thongTinDangKyThuoc ? data[i].thongTinDangKyThuoc.dangBaoChe : null,
            diaChiSX: data[i].congTySanXuat ? data[i].congTySanXuat.diaChiSanXuat : null,
        };
        result.push(inforPobs);
    }

    res
        .status(200)
        .json({
            status: "success",
            data: { result }
        })
}

const getReply = async (req, res) => {
    const content = Object.assign({ id: 1 }, req.body);


    const question = content.message;
    const apiKey = process.env.OPENAI_API_KEY;
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const model = 'gpt-3.5-turbo';
    const messages = [{ role: 'user', content: `${question}` }];
    const temperature = 0.7;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature })
        });

        const data = await response.json();
        const reply = data.choices[0].message.content
        res.json({
            status: "sccuess",
            reply: { reply },
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching data from OpenAI' });
    }

};

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const handleScan = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    const formData = new FormData();
    formData.append("file", file.buffer, { filename: file.originalname });

    const apiOcr = "https://medifind-ocr.proudsea-d3f4859a.eastasia.azurecontainerapps.io/process_image";
    console.log("start");
    try {
        const response = await fetch(apiOcr, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders(),
        });

        if (!response.ok) {
            console.log("Picture upload fail", response.status);
            res.status(response.status).json({ error: "Picture upload failed" });
        } else {
            const jsonArray = await response.json();
            const result = [];
            for (let i = 0; i < jsonArray.results.length; i++) {
                const inforPobs = {
                    ten: jsonArray.results[i].tenThuoc,
                    hoatChatChinh: jsonArray.results[i].thongTinThuocCoBan ? jsonArray.results[i].thongTinThuocCoBan.hoatChatChinh : null,
                    SDK: jsonArray.results[i].soDangKy,
                    SQD: jsonArray.results[i].thongTinDangKyThuoc ? jsonArray.results[i].thongTinDangKyThuoc.soQuyetDinh : null,
                    xuatSu: jsonArray.results[i].congTySanXuat ? jsonArray.results[i].congTySanXuat.nuocSanXuat : null,
                    congTy: jsonArray.results[i].congTySanXuat ? jsonArray.results[i].congTySanXuat.tenCongTySanXuat : null,
                    dangBaoChe: jsonArray.results[i].thongTinDangKyThuoc ? jsonArray.results[i].thongTinDangKyThuoc.dangBaoChe : null,
                    diaChiSX: jsonArray.results[i].congTySanXuat ? jsonArray.results[i].congTySanXuat.diaChiSanXuat : null,
                };
                result.push(inforPobs);
            }
            res.status(200).json(result);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred while processing the image" });
    }

}

const signUp = async (req, res) => {
    console.log(req.body);
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res
            .status(422)
            .json({ error: "User already exists with that email" });
    }
    try {
        const user = new User({
            name,
            email,
            password,
            toDoList: [],
            historySearch: [],
        });
        await user.save();
        res.status(201).json({ status: "success", data: { user } });
    } catch (error) {
        res.status(400).json({ status: "fail", message: error.message });
    }
}

const signIn = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(422).json({ error: "Please add email or password" });
    }

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(422).json({ status: "fail", error: "Invalid Email" });
    }

    if (user.password === password) {
        res.json({ status: "success", userID: user._id, name: user.name });
    } else {
        return res.status(422).json({ status: "fail", error: "Invalid password" });
    }
};
const createReminder = async (req, res) => {
    const { name, amount, hour, minute, period, start_date, start_month, start_year } = req.body;
    const userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const reminder = new Reminder({ name, amount, hour, minute, period, start_date, start_month, start_year, state: false, user: userId });
    await reminder.save();
    res.status(201).json({ status: "success", data: { reminder } });
};
const getReminder = async (req, res) => {
    const userID = req.params.id;
    if (!mongoose.isValidObjectId(userID)) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(userID);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    else {
        const reminders = await Reminder.find({ user: userID });
        res.status(200).json({ status: "success", data: { reminders } });
    }
}
const updateReminder = async (req, res) => {
    const reminderID = req.params.reminderID;
    const userID = req.params.userID;
    if (!mongoose.isValidObjectId(reminderID) || !mongoose.isValidObjectId(userID)) {
        return res.status(404).json({ error: 'Reminder not found' });
    }
    const reminder = await Reminder.findById(reminderID);
    if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
    }
    else {
        reminder.state = !reminder.state;
        await reminder.save();
        const reminders = await Reminder.find({ user: userID });
        res.status(200).json({ status: "success", data: { reminders } });
    }
}
const updateHistorySearch = async (req, res) => {
    const userID = req.params.id;
    const drugName = req.body.name;
    if (!mongoose.isValidObjectId(userID)) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(userID);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.historySearch.push({ name: drugName });
    await user.save();
    res.status(200).json({ status: "success", data: { history: user.historySearch } });

}
const getHistorySearch = async (req, res) => {
    const userID = req.params.id;
    if (!mongoose.isValidObjectId(userID)) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(userID);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    else {
        res.status(200).json({ status: "success", data: { history: user.historySearch } });
    }

}
const getHistoryMedicine = async (req, res) => {
    const userID = req.params.id;
    if (!mongoose.isValidObjectId(userID)) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(userID);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    else {
        res.status(200).json({ status: "success", data: { history: user.historyMedicine } });
    }
}
const postHistoryMedicine = async (req, res) => {
    const userID = req.params.id;
    const newHistory = req.body;
    if (!mongoose.isValidObjectId(userID)) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(userID);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    else {
        user.historyMedicine.push(...newHistory);
        await user.save();
        res.status(200).json({ status: "success" });
    }
}


module.exports = { getDrugWithName, getReply, handleScan, upload, signUp, signIn, createReminder, getReminder, updateReminder, updateHistorySearch, getHistorySearch, getHistoryMedicine, postHistoryMedicine }