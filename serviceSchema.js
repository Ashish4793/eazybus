const mongoose = require("mongoose");
const serviceSchema = new mongoose.Schema({
    service_no: String,
    service_date: String,
    origin: String,
    destination: String,
    status : Boolean,
    type: String,
    bus_type: String,
    dep_time: String,
    arr_time: String,
    journeyDuration : String,
    boarding_point : String,
    drop_point : String,
    fare: String,
    seat: [{
        seat_no: String,
        seat_status: String,
    }],
    createdAt: { type: Date, default: Date.now, expires: 180000 }
});

module.exports = mongoose.model('Service', serviceSchema);