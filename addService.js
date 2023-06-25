const mongoose = require("mongoose");
const Service = require("./serviceSchema");
const Bus = require("./busSchema");

function addService(date){
    Service.find({service_date : date} , function(err , foundService){
        if (!err) {
            if (foundService.length === 0) {
                Bus.find({} , function(err , foundBuses){
                    if (!err) {
                        foundBuses.forEach(function(bus){
                            if (bus.type === "sleeper") {
                                const array = ['1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '4C', '5A', '5B', '5C', '6A', '6B', '6C'];
                                const newService = new Service({
                                    service_no: bus.bus_service_no,
                                    service_date: date,
                                    status : true,
                                    origin: bus.bus_origin,
                                    destination: bus.bus_destination,
                                    type: bus.type,
                                    bus_type: bus.bus_name,
                                    dep_time: bus.bus_dep_time,
                                    arr_time: bus.bus_arr_time,
                                    journeyDuration : bus.journeyDuration,
                                    boarding_point : bus.boarding_point,
                                    drop_point : bus.drop_point,
                                    fare: bus.fare,
                                    seat: [{
                                        seat_no: array[0],
                                        seat_status: "disabled"
                                    }, {
                                        seat_no: array[1],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[2],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[3],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[4],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[5],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[6],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[7],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[8],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[9],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[10],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[11],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[12],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[13],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[14],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[15],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[16],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[17],
                                        seat_status: "enabled",
                                    },]
                                });
                                newService.save(function (err) {
                                    if (!err) {
                                        //saved service
                                    } else {
                                        console.log(err);
                                    }
                                });
                            } else {
                                const array = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '2D', '3A', '3B', '3C', '3D', '4A', '4B', '4C', '4D', '5A', '5B', '5C', '5D', '6A', '6B', '6C', '6D', '7A', '7B', '7C', '7D', '8A', '8B', '8C', '8D', '9A', '9B', '9C', '9D'];
                                const newService = new Service({
                                    service_no: bus.bus_service_no,
                                    service_date: date,
                                    status : true,
                                    origin: bus.bus_origin,
                                    destination: bus.bus_destination,
                                    type: bus.type,
                                    bus_type: bus.bus_name,
                                    dep_time: bus.bus_dep_time,
                                    arr_time: bus.bus_arr_time,
                                    journeyDuration : bus.journeyDuration,
                                    boarding_point : bus.boarding_point,
                                    drop_point : bus.drop_point,
                                    fare: bus.fare,
                                    seat: [{
                                        seat_no: array[0],
                                        seat_status: "disabled"
                                    }, {
                                        seat_no: array[1],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[2],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[3],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[4],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[5],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[6],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[7],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[8],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[9],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[10],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[11],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[12],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[13],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[14],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[15],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[16],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[17],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[18],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[19],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[20],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[21],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[22],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[23],
                                        seat_status: "disabled",
                                    }, {
                                        seat_no: array[24],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[25],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[26],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[27],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[28],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[29],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[30],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[31],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[32],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[33],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[34],
                                        seat_status: "enabled",
                                    }, {
                                        seat_no: array[35],
                                        seat_status: "enabled",
                                    }]
                                });
                                newService.save(function (err) {
                                    if (!err) {
                                        //saved service
                                    } else {
                                        console.log(err);
                                    }
                                });
                            }
                        })
                    } else {
                        console.log(err);
                    }
                });
            } else {
                // service already exists
            }
        } else {
            console.log(err);
        }
    });
}


module.exports = { addService };