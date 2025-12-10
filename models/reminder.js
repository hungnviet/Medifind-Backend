const mongoose = require('mongoose');
const reminderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    hour: {
        type: Number,
        required: true,
    },
    minute: {
        type: Number,
        required: true,
    },
    dosageUnit: {
        type: String,
        default: 'tablet',
    },
    note: {
        type: String,
        default: '',
    },
    state: {
        type: Boolean,
        default: false,
    },
    period: {
        type: Number,
        required: true,
    },
    start_date: {
        type: Number,
        required: true,
    },
    start_month: {
        type: Number,
        required: true,
    },
    start_year: {
        type: Number,
        required: true,
    },
    end_date: {
        type: Number,
    },
    end_month: {
        type: Number,
    },
    end_year: {
        type: Number,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    }
});
mongoose.model("Reminder", reminderSchema);
