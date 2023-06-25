const mongoose = require("mongoose");
const busSchema = new mongoose.Schema({
    bus_service_no: String,
    bus_origin: String,
    bus_destination: String,
    type: String,
    bus_name: String,
    bus_dep_time: String,
    bus_arr_time: String,
    journeyDuration : String,
    boarding_point : String,
    drop_point : String,
    fare: String
});

module.exports = mongoose.model('Bus', busSchema);