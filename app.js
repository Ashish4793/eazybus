//jshint esversion:6
require('dotenv').config();
// suppress aws warning
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const ejs = require("ejs");
const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const session = require("express-session");
const MongoStore = require('connect-mongo')(session);
const Service = require("./serviceSchema");
const Bus = require("./busSchema");
const { DateTime } = require("luxon");
const { addService } = require("./addService");
const nodemailer = require('nodemailer');
const fs = require('fs');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const generateUniqueId = require('generate-unique-id');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const { log } = require('console');
const { type } = require('os');

passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

const app = express();
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: 6000000
    },
    store: new MongoStore({ mongooseConnection: mongoose.connection })
}));


//aws initialize

AWS.config.update({
    accessKeyId: process.env.AWS_ID,
    secretAccessKey: process.env.AWS_SECRET
});

app.use(passport.initialize());
app.use(passport.session());

mongoose.set("strictQuery", false);
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);

    } catch (error) {
        console.log(error);
        process.exit(1);
    }
};

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    authType: String,
    name: String,
    phone: { type: String, unique: true },
    email: { type: String, unique: true },
    gender: String,
    doj: String,
    password: String,
    verified: { type: Boolean, default: false }
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);


const bookingSchema = new mongoose.Schema({
    userID: String,
    bookingID: { type: String, unique: true },
    transactionID: { type: String, unique: true },
    paymentMethod: { type: String, default: "stripe" },
    bookingDate: String,
    bookingTime: String,
    bookingStatus: String,
    service_no: String,
    bus_type: String,
    origin: String,
    destination: String,
    journeyDate: String,
    dep_time: String,
    arr_time: String,
    boarding_point: String,
    drop_point: String,
    pax_name: String,
    pax_age: String,
    pax_phone: String,
    pax_gender: String,
    seats: [],
    fare: String,
});


const searchQSchema = new mongoose.Schema({
    userID: { type: String, unique: true },
    date: String,
    serviceNo: String,
    seats: []
});

const tempDetails = new mongoose.Schema({
    userID: { type: String, unique: true },
    bookingID: String,
    origin: String,
    destination: String,
    service_no: String,
    dep_date: String,
    dep_time: String,
    arr_time: String,
    boarding_point: String,
    drop_point: String,
    bus_type: String,
    pax_name: String,
    pax_age: String,
    pax_phone: String,
    pax_gender: String,
    seats: [],
    bill_amount: String,
});

const otpSchema = new mongoose.Schema({
    userID: { type: String, unique: true },
    otp: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }
});

const walletSchema = new mongoose.Schema({
    userID: { type: String, unique: true },
    Name: String,
    PAN: { type: String, unique: true },
    balance: { type: Number, default: 0, min: 0 }
});

const walletTransactionSchema = new mongoose.Schema({
    userID: String,
    amount: Number,
    type: { type: String, enum: ['credit', 'debit'] },
    status: { type: String, enum: ['initiated', 'completed', 'failed'] },
    date: { type: Date, default: Date.now },
    paymentID: { type: String, default: "-" }
});

const giftCardSchema = new mongoose.Schema({
    userID : String,
    cardID : {type : String , unique : true},
    cardPin : String,
    faceValue : Number,
    recName : String,
    recEmail : String,
    recMsg : String,
    status : {type : String , enum : ['open' ,'redeemed'] , default : "open"},
    paymentID : {type : String , default : "null"},
    paymentStatus : {type : String , enum : ['initiated' , 'completed'] , default : "initiated"}
});

const User = mongoose.model("User", userSchema);
const SearchQ = mongoose.model("SearchQ", searchQSchema);
const TempD = mongoose.model("TempD", tempDetails);
const Booking = mongoose.model("Booking", bookingSchema);
const Otp = mongoose.model("Otp", otpSchema);
const Wallet = mongoose.model("Wallet", walletSchema);
const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
const GiftCard = mongoose.model("GiftCard" , giftCardSchema);

// function to generate Invoice

async function generateInvoice(booking , user) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const template = fs.readFileSync('invoicetemp.ejs', 'utf8');
  
    // Define custom data to be rendered
    const data = {
      booking : booking,
      user : user
    };
  
    const html = ejs.render(template, data);
  
    await page.setContent(html, { waitUntil: 'networkidle0' });
  
    // Generate PDF from the page
    const pdfBuffer = await page.pdf();
  
    await browser.close();
  
    return pdfBuffer;
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({ username: profile.id, email: profile.emails[0].value, authType: "google" }, function (err, user, created) {
            if (err) {
                return cb(null, false);
            }
            user.wasNew = created;
            return cb(null, user);
        });
    }
));


passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_ID,
        pass: process.env.MAIL_PASS
    },
    tls: {
        rejectedUnauthorized: false
    }
});




function getCurrentTime() {
    const now = DateTime.now().setZone('Asia/Kolkata').plus({ minutes: 25 });
    let hour = now.hour.toString();
    let minutes = now.minute.toString();
    if (hour.length < 2) {
        hour = "0" + hour;
    } else {
        // do nothing
    }
    if (minutes.length < 2) {
        minutes = "0" + minutes;
    } else {
        // do nothing
    }
    let currentTime = hour + ":" + minutes;
    return currentTime;
}

function getLastDate() {
    const now = DateTime.now().setZone('Asia/Kolkata').minus({ days: 1 });
    let day = now.day.toString();
    let month = now.month.toString();
    const year = now.year.toString();
    if (day.length < 2) {
        day = "0" + day;
    } else {
        // do nothing
    }
    if (month.length < 2) {
        month = "0" + month;
    } else {
        // do nothing
    }
    let currentDate = day + "-" + month + "-" + year;
    return currentDate;
}

function getTommorowDate() {
    const now = DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 });
    let day = now.day.toString();
    let month = now.month.toString();
    const year = now.year.toString();
    if (day.length < 2) {
        day = "0" + day;
    } else {
        // do nothing
    }
    if (month.length < 2) {
        month = "0" + month;
    } else {
        // do nothing
    }
    let currentDate = day + "-" + month + "-" + year;
    return currentDate;
}
function getCurrentDate() {
    const now = DateTime.now().setZone('Asia/Kolkata');
    let day = now.day.toString();
    let month = now.month.toString();
    const year = now.year.toString();
    if (day.length < 2) {
        day = "0" + day;
    } else {
        // do nothing
    }
    if (month.length < 2) {
        month = "0" + month;
    } else {
        // do nothing
    }
    let currentDate = day + "-" + month + "-" + year;
    return currentDate;
}



const yestDate = getLastDate();
const todayDate = getCurrentDate();
const tommorowDate = getTommorowDate();
const currentTime = getCurrentTime();

function serviceCheck(date, time) {
    Service.find({ service_date: date, status: true }, function (err, foundService) {
        if (!err) {
            foundService.forEach(function (service) {
                const [hours1, minutes1] = service.dep_time.split(":").map(Number);
                const [hours2, minutes2] = time.split(":").map(Number);
                if (hours1 < hours2 || (hours1 === hours2 && minutes1 < minutes2)) {
                    Service.updateOne({ _id: service._id }, { status: false }, function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("updated id with" + service.service_no);
                        }
                    });
                } else {
                    // no update
                }

            });
        } else {
            console.log(err);
        }
    });
}

function BookingsCheck() {
    Booking.find({ bookingStatus: "initiated" }, function (err, foundBookings) {
        if (!err) {
            foundBookings.forEach(function (booking) {
                const date1 = booking.bookingTime;
                const date2 = new Date().getTime().toString();
                const diffInMilliseconds = Math.abs(date2 - date1);
                const diffInMinutes = Math.floor(diffInMilliseconds / 60000);
                if (diffInMinutes > 10) {
                    const newArray = booking.seats;
                    newArray.forEach(function (element) {
                        Service.updateOne(
                            { service_no: booking.service_no, service_date: booking.journeyDate, 'seat.seat_no': element },
                            { $set: { 'seat.$.seat_status': 'enabled' } },
                            function (err, count) {
                                if (!err) {
                                    Booking.findOneAndDelete({ _id: booking._id }, function (err) {
                                        if (!err) {
                                            //Pending bookings deleted
                                        } else {
                                            console.log(err);
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                    });
                }
            });
        } else {
            console.log(err);
        }
    });
}

function bookingStatusCheck() {
    Booking.find({ bookingStatus: "paid" }, function (err, foundBookings) {
        if (!err) {
            foundBookings.forEach(function (booking) {
                const date1 = booking.bookingTime;
                const date2 = new Date().getTime().toString();
                const diffInMilliseconds = Math.abs(date2 - date1);
                const diffInMinutes = Math.floor(diffInMilliseconds / 60000);
                if (diffInMinutes > 2700) {
                    Booking.updateOne({ bookingID: booking.bookingID }, { bookingStatus: "completed" }, function (err) {
                        if (!err) {
                            //booking status marked as completed
                        } else {
                            console.log(err);
                        }
                    });
                }
            });
        } else {
            console.log(err);
        }
    });
}

function transactionCheck() {
    Booking.find({ bookingStatus: "initiated" }, function (err, foundBookings) {
        if (!err) {
            foundBookings.forEach(function (booking) {
                stripe.checkout.sessions.retrieve(booking.transactionID, (err, session) => {
                    if (!err) {
                        if (session.payment_status === "paid") {
                            Booking.findOneAndUpdate({ bookingID: booking.bookingID }, { bookingStatus: "paid" }, function (err) {
                                if (!err) {
                                    // booking updated succesfully
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            // do nothing
                        }
                    } else {
                        console.log(err);
                    }
                });
            });
        }
    });
}

function wallettransactionCheck() {
    WalletTransaction.find({ status: "initiated" }, function (err, foundTransactions) {
        if (!err) {
            foundTransactions.forEach(function (transaction) {
                stripe.checkout.sessions.retrieve(transaction.paymentID, (err, session) => {
                    if (!err) {
                        if (session.payment_status === "paid") {
                            Wallet.updateOne({ userID: transaction.userID, },
                                { $inc: { balance: transaction.amount } }, { new: true }, function (err) {
                                    if (!err) {
                                        WalletTransaction.updateOne({ _id: transaction._id },
                                            { status: "completed" }, function (err) {
                                                if (!err) {
                                                    //do nothing
                                                } else {
                                                    console.log(err);
                                                }
                                            });
                                    } else {
                                        console.log(err);
                                    }
                                });
                        } else {
                            // do nothing
                        }
                    } else {
                        console.log(err);
                    }
                });
            })
        } else {
            console.log(err);
        }
    })
}

function deletePrevDayService(date) {
    Service.deleteMany({ service_date: date }, function (err) {
        if (!err) {
            // deleted prev day service
        } else {
            console.log(err);
        }
    });
}


app.get('/auth/google',
    passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'], prompt: 'select_account' }));

app.get('/auth/google/callback',  passport.authenticate('google', { failureRedirect: '/uaxerror' }),
    function (req, res) {
        if (req.user && req.user.wasNew) {
            // New user, redirect to user onboarding page
            res.redirect("/onboarding");
        } else {
            // Existing user, redirect to home page
            res.redirect('/');
        }
    });

app.get("/onboarding", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.authType === "google") {
            if (req.user.verified === false) {
                res.render("onboarding", { err: false });
            } else {
                res.redirect("/")
            }
        } else {
            res.redirect("/");
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/onboarding", function (req, res) {
    if (req.isAuthenticated()) {
        const date = new Date().getFullYear().toString();
        User.findOneAndUpdate({ _id: req.user._id, authType: "google" }, { name: req.body.name, phone: req.body.phone, gender: req.body.gender, doj: date, verified: true }, function (err) {
            if (!err) {
                User.findOne({ _id: req.user._id }, function (err, foundUser) {
                    if (!err) {
                        const template = fs.readFileSync('email-temps/welcometemplate.ejs', 'utf8');
                        const data = {
                            name: foundUser.name
                        };
                        const html = ejs.render(template, data);
                        const mailOptions = {
                            from: process.env.MAIL_ID,
                            to: foundUser.email,
                            subject: 'Welcome to EazyBus',
                            html: html
                        };
                        transporter.sendMail(mailOptions, (error, info) => {
                            if (error) {
                                console.log('Error occurred:', error.message);
                            } else {
                                res.redirect("/logout");
                            }
                        });
                    } else {
                        console.log(err);
                    }
                });
            } else {
                res.render("onboarding", { err: true });
            }
        });
    } else {
        res.redirect("/login");
    }
});



app.get("/login", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/");
    } else {
        res.render("login", { badCred: false });
    }
});

app.get("/register", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/sign-in-success");
    } else {
        res.render("register", { uaxError: false });
    }
});

app.get("/badcred", function (req, res) {
    res.render("login", { badCred: true });
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/sign-in-success",
    failureRedirect: "/badcred"
}), function (req, res) {
});

app.post("/register", function (req, res) {
    const year = new Date().getFullYear().toString();
    User.register({ username: req.body.username, email: req.body.username, authType: "local", name: req.body.name, phone: req.body.phone, gender: req.body.gender, doj: year, verified: true }, req.body.password, function (err, user) {
        if (err) {
            res.render("register", { uaxError: true });
        } else {
            passport.authenticate("local")(req, res, function () {
                const template = fs.readFileSync('email-temps/welcometemplate.ejs', 'utf8');
                const data = {
                    name: req.body.name
                };
                const html = ejs.render(template, data);
                const mailOptions = {
                    from: process.env.MAIL_ID,
                    to: req.body.username,
                    subject: 'Welcome to EazyBus',
                    html: html
                };
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.log('Error occurred:', error.message);
                    } else {
                        res.redirect("/");
                    }
                });
            });
        }
    });
});


app.get("/uaxerror", function (req, res) {
    res.render("register", { uaxError: true });
});

app.post("/addbus", async function (req, res) {
    function calculateTimeDifference(dep_time, arr_time) {
        var time1 = dep_time;
        var time2 = arr_time;
        var date1 = new Date("2000-01-01T" + time1);
        var date2 = new Date("2000-01-01T" + time2);

        // Check if the second time is smaller than the first time
        if (date2 < date1) {
            date2.setDate(date2.getDate() + 1); // Add 24 hours to the second time
        }
        var diffInMilliseconds = Math.abs(date2 - date1);
        var hours = Math.floor(diffInMilliseconds / 3600000).toString();
        var minutes = Math.floor((diffInMilliseconds % 3600000) / 60000).toString();
        if (hours.length < 2) {
            hours = "0" + hours;
        }
        if (minutes.length < 2) {
            minutes = "0" + minutes;
        }
        const final = `${hours}h ${minutes}m`
        return final;
    }
    const jD = calculateTimeDifference(req.body.dep_time, req.body.arr_time);
    const newBus = new Bus({
        bus_service_no: req.body.service_no,
        bus_origin: req.body.origin,
        bus_destination: req.body.destination,
        type: req.body.type,
        bus_name: req.body.bus_name,
        bus_dep_time: req.body.dep_time,
        boarding_point: req.body.boarding_point,
        journeyDuration: jD,
        drop_point: req.body.drop_point,
        bus_arr_time: req.body.arr_time,
        fare: req.body.fare
    });
    newBus.save(function (err) {
        if (!err) {
            console.log("Bus Saved!");
        } else {
            console.log(err);
        }
    });
});

//// Home route


app.get("/", function (req, res) {
    deletePrevDayService(yestDate);
    addService(todayDate);
    addService(tommorowDate);
    serviceCheck(todayDate, currentTime);
    BookingsCheck();
    bookingStatusCheck();
    transactionCheck();
    wallettransactionCheck();
    if (req.isAuthenticated()) {
        if (req.user.verified === false) {
            res.render("onboarding", { err: false });
        } else {
            User.findOne({_id : req.user._id} , function(err , foundUser){
                if (!err) {
                    const [name] = foundUser.name.split(' ');
                    res.render("home", { loggedIn: true, name: name, user_gender: foundUser.gender });
                } else {
                    console.log(err);
                }
            });
        }
    } else {
        res.render("home", { loggedIn: false });
    }
});

app.get("/bookings", function (req, res) {
    if (req.isAuthenticated()) {
        bookingStatusCheck();
        transactionCheck();
        if (req.user.verified === false) {
            res.render("onboarding", { err: false });
        } else {
            Booking.find({ userID: req.user._id }, function (err, foundBookings) {
                if (!err) {
                    res.render("bookings", { foundBookings: foundBookings });
                } else {
                    console.log(err);
                }
            });
        }
    } else {
        res.redirect("/login")
    }
});

app.get("/bookings/:bookingID", function (req, res) {
    if (req.isAuthenticated()) {
        Booking.findOne({ bookingID: req.params.bookingID }, function (err, foundBookings) {
            if (!err) {
                Service.findOne({ service_no: foundBookings.service_no, service_date: foundBookings.journeyDate }, function (err, foundService) {
                    if (!err) {
                        if (foundService === null) {
                            res.render("bookingdetails", { Booking: foundBookings, status: false });
                        } else {
                            res.render("bookingdetails", { Booking: foundBookings, status: foundService.status })
                        }
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login")
    }
});

app.get("/download-ticket/:bookingID", function (req, res) {
    if (req.isAuthenticated()) {
        Booking.findOne({ bookingID: req.params.bookingID, bookingStatus: "paid" }, function (err, foundBooking) {
            if (!err) {
                if (foundBooking != null) {
                    res.render("mticket", { foundBooking: foundBooking });
                } else {
                    res.redirect("/bookings")
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/download-taxinvoice", function (req, res) {
    if (req.isAuthenticated()) {
        const bookingId = req.query.bookingId;
        Booking.findOne({bookingID : bookingId} , function(err , foundBooking){
            if (!err) {
                if (foundBooking.userID === req.user._id) {
                    const s3 = new AWS.S3();
                    const bucketName = process.env.AWS_BUCKET_NAME;
                    const fileName = 'invoices/'+ bookingId + '.pdf';
                    const params = {
                        Bucket: bucketName,
                        Key: fileName
                    };
                    res.attachment(fileName);
                    const fileStream = s3.getObject(params).createReadStream();  
                    fileStream.pipe(res);
                } else {
                    res.redirect("/bookings");
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/terms", function (req, res) {
    res.render("t&c");
});

app.get("/faqs", function (req, res) {
    res.render("faqs");
});

app.get("/contact", function (req, res) {
    res.render("contact");
});

app.get("/privacy", function (req, res) {
    res.render("privacy");
});

app.get("/about", function (req, res) {
    res.render("about");
});

app.get("/forgot", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/");
    } else {
        res.render("reqotp");
    }
});

app.post("/generateotp", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/");
    } else {
        Otp.findOneAndDelete({ userID: req.body.email }, function (err) {
            if (!err) {
                User.findOne({ email: req.body.email, authType: "local" }, function (err, foundUser) {
                    if (!err) {
                        if (foundUser != null) {
                            const newOtp = new Otp({
                                userID: req.body.email,
                                otp: generateUniqueId({ length: 6, useLetters: false })
                            });
                            newOtp.save(function (err) {
                                if (!err) {
                                    Otp.findOne({ userID: req.body.email }, function (err, foundOTP) {
                                        if (!err) {
                                            const template = fs.readFileSync('email-temps/otptemplate.ejs', 'utf8');
                                            const data = {
                                                otp: foundOTP.otp
                                            };
                                            const html = ejs.render(template, data);
                                            const mailOptions = {
                                                from: process.env.MAIL_ID,
                                                to: foundOTP.userID,
                                                subject: 'Forgot Password',
                                                html: html
                                            };
                                            transporter.sendMail(mailOptions, (error, info) => {
                                                if (error) {
                                                    console.log('Error occurred:', error.message);
                                                } else {
                                                    res.render("verifyotp", { user: req.body.email });
                                                }
                                            });
                                        } else {
                                            console.log(err);
                                        }
                                    });
                                } else {
                                    res.redirect("/forgot");
                                }
                            });
                        } else {
                            res.render("verifyotp", { user: null });
                        }
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });

    }
});

app.get("/reset", function (req, res) {
    res.render("resetpass");
});

app.post("/verifyotp", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/");
    } else {
        Otp.findOne({ userID: req.body.email }, function (err, foundOTP) {
            if (!err) {
                if (foundOTP != null) {
                    if (foundOTP.otp === req.body.otp) {
                        res.render("resetpass", { user: foundOTP.userID });
                        Otp.findOneAndDelete({ userID: foundOTP.userID, otp: foundOTP.otp }, function (err) {
                            if (!err) {
                                // do nothing
                            } else {
                                console.log(err);
                            }
                        });
                    } else {
                        res.render("wrongotp");
                    }
                } else {
                    res.render("wrongotp");
                }
            } else {
                res.redirect("/forgot");
            }
        });
    }
});

app.post("/resetpass", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/");
    } else {
        User.findOne({ username: req.body.email }, function (err, foundUser) {
            if (!err) {
                foundUser.setPassword(req.body.password2, function () {
                    foundUser.save(function (err) {
                        if (!err) {
                            const template = fs.readFileSync('email-temps/passchangetemplate.ejs', 'utf8');
                            const data = {
                                name: foundUser.name,
                            };
                            const html = ejs.render(template, data);
                            const mailOptions = {
                                from: process.env.MAIL_ID,
                                to: foundUser.email,
                                subject: 'Account Update',
                                html: html
                            };
                            transporter.sendMail(mailOptions, (error, info) => {
                                if (error) {
                                    console.log('Error occurred:', error.message);
                                } else {
                                    res.render("rspsuccess");
                                }
                            });
                        } else {
                            console.log(err);
                        }
                    });
                });
            } else {
                console.log(err);
            }
        });
    }
});





app.get("/cancel-booking/:bookingID", function (req, res) {
    if (req.isAuthenticated()) {
        Booking.findOne({ bookingID: req.params.bookingID, bookingStatus: "paid" }, function (err, foundBooking) {
            if (!err) {
                if (foundBooking != null) {
                    Service.findOne({ service_no: foundBooking.service_no, service_date: foundBooking.journeyDate }, function (err, foundService) {
                        if (!err) {
                            if (foundService != null && foundService.status === true) {
                                res.render("bookingcancel", { foundBooking: foundBooking });
                            } else {
                                res.redirect("/bookings");
                            }
                        } else {
                            console.log(err);
                        }
                    });
                } else {
                    res.redirect("/bookings")
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});


app.post("/cancellation", function (req, res) {
    if (req.isAuthenticated()) {
        Booking.findOne({ bookingID: req.body.bookingID, bookingStatus: "paid" }, function (err, foundBooking) {
            if (!err) {
                if (foundBooking != null) {
                    const newArray = foundBooking.seats;
                    newArray.forEach(function (element) {
                        Service.updateOne(
                            { service_no: foundBooking.service_no, service_date: foundBooking.journeyDate, 'seat.seat_no': element },
                            { $set: { 'seat.$.seat_status': 'enabled' } },
                            function (err, count) { if (!err) { } else { console.log(err); } });
                    });
                    Booking.findOneAndUpdate({ bookingID: req.body.bookingID, bookingStatus: "paid" }, { bookingStatus: "cancelled" }, function (err) {
                        if (!err) {
                            User.findOne({ _id: foundBooking.userID }, function (err, foundUser) {
                                if (!err) {
                                    const refund = parseInt(foundBooking.fare);
                                    const refundAmount = Math.floor(refund / 2);
                                    const template = fs.readFileSync('email-temps/bookcanceltemplate.ejs', 'utf8');
                                    const data = {
                                        name: foundUser.name,
                                        bookingID: foundBooking.bookingID,
                                        source: foundBooking.origin,
                                        destination: foundBooking.destination,
                                        refund: refundAmount,
                                        journeyDate: foundBooking.journeyDate,
                                        paymentMethod: foundBooking.paymentMethod
                                    };
                                    const html = ejs.render(template, data);
                                    const mailOptions = {
                                        from: process.env.MAIL_ID,
                                        to: foundUser.email,
                                        subject: 'Booking Cancellation',
                                        html: html
                                    };
                                    transporter.sendMail(mailOptions, (error, info) => {
                                        if (error) {
                                            console.log('Error occurred:', error.message);
                                        } else {
                                            if (foundBooking.paymentMethod === "wallet") {
                                                Wallet.updateOne({ userID: foundBooking.userID, },
                                                    { $inc: { balance: refundAmount } }, { new: true }, function (err) {
                                                        if (!err) {
                                                            res.render("bookingcancelmsg", { bookingID: req.body.bookingID, refundAmt: refundAmount });
                                                            const template1 = fs.readFileSync('email-temps/walletcredittemplate.ejs', 'utf8');
                                                            const data1 = {
                                                                name: foundUser.name,
                                                                amount: refundAmount
                                                            };
                                                            const html1 = ejs.render(template1, data1);
                                                            const mailOptions1 = {
                                                                from: process.env.MAIL_ID,
                                                                to: foundUser.email,
                                                                subject: 'Wallet Update',
                                                                html: html1
                                                            };
                                                            transporter.sendMail(mailOptions1, (error, info) => {
                                                                if (!error) {
                                                                    //do nothing
                                                                } else {
                                                                    console.log(error);
                                                                }
                                                            });
                                                        } else {
                                                            console.log(err);
                                                        }
                                                    });
                                            } else {
                                                res.render("bookingcancelmsg", { bookingID: req.body.bookingID, refundAmt: refundAmount });
                                            }
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            res.redirect("/bookings");
                            console.log(err);
                        }
                    });
                } else {
                    res.redirect("/bookings")
                }

            } else {
                res.redirect("/bookings")
            }
        });
    } else {
        res.redirect("/login")
    }
});

app.get("/profile", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.verified === false) {
            res.render("onboarding", { err: false });
        } else {
            User.findOne({_id : req.user._id} , function(err , foundUser){
                if (!err) {
                    res.render("profile", { user: foundUser });
                } else {
                    console.log(err);
                }
            });
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/changepass", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.authType === "local") {
            res.render("changepass", { err: false });
        } else {
            res.redirect("/");
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/changepass", function (req, res) {
    if (req.isAuthenticated()) {
        User.findOne({ username: req.user.username }, function (err, foundUser) {
            if (foundUser != null) {
                foundUser.changePassword(req.body.oldpass, req.body.newpass, function (err) {
                    if (err) {
                        if (err.name === "IncorrectPasswordError") {
                            res.render("changepass", { err: true });
                        } else {
                            res.render("errors/swrerror");
                        }
                    } else {
                        req.logout(function (err) {
                            if (!err) {
                                const template = fs.readFileSync('email-temps/passchangetemplate.ejs', 'utf8');
                                const data = {
                                    name: foundUser.name,
                                };
                                const html = ejs.render(template, data);
                                const mailOptions = {
                                    from: process.env.MAIL_ID,
                                    to: foundUser.email,
                                    subject: 'Account Update',
                                    html: html
                                };
                                transporter.sendMail(mailOptions, (error, info) => {
                                    if (error) {
                                        console.log('Error occurred:', error.message);
                                    } else {
                                        res.render("rspsuccess");
                                    }
                                });
                            } else {
                                console.log(err);
                            }
                        });
                    }
                });
            } else {
                res.render("errors/swrerror")
            }
        });
    } else {
        res.redirect("/");
    }
});

app.get("/editprofile", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.verified === false) {
            res.render("onboarding", { err: false });
        } else {
            User.findOne({ _id: req.user._id }, function (err, user) {
                if (!err) {
                    res.render("editprofile", { user: user, profileUpdate: false, err: false });
                } else {
                    console.log(err);
                }
            });
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/editprofile", function (req, res) {
    if (req.isAuthenticated()) {
        User.findOneAndUpdate({ _id: req.body.user_id }, { name: req.body.name, phone: req.body.phone, gender: req.body.gender }, { new: true }, function (err, user) {
            if (!err) {
                res.render("editprofile", { user: user, profileUpdate: true, err: false });
            } else {
                res.render("editprofile", { user: req.user, profileUpdate: false, err: true });
            }
        });
    } else {
        res.redirect("/login")
    }
});


app.get("/logout", function (req, res) {
    if (req.isAuthenticated()) {
        req.logout(function (err) { });
        res.redirect("/login");
    } else {
        res.redirect("/login");
    }
});

//////Wallet Section code <Starts Here>

app.get("/wallet", function (req, res) {
    wallettransactionCheck();
    if (req.isAuthenticated()) {
        Wallet.findOne({ userID: req.user._id }, function (err, foundWallet) {
            if (!err) {
                if (foundWallet != null) {
                    res.render("wallet", { wallet: foundWallet })
                } else {
                    res.render("getwallet");
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/getwallet", function (req, res) {
    res.render("getwallet");
});

app.get("/applywallet", (req, res) => {
    if (req.isAuthenticated()) {
        Wallet.findOne({ userID: req.user._id }, function (err, foundWallet) {
            if (!err) {
                if (foundWallet != null) {
                    res.redirect("/wallet");
                } else {
                    res.render("applywallet");
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.post("/applywallet", function (req, res) {
    if (req.isAuthenticated()) {
        const newWallet = new Wallet({
            userID: req.user._id,
            Name: req.body.name,
            PAN: req.body.pan,
        });

        newWallet.save((err) => {
            if (!err) {
                Wallet.findOne({ userID: req.user._id }, function (err, foundWallet) {
                    if (!err) {
                        res.render("walletsuc", { walletInfo: foundWallet });
                    } else {
                        console.log(err);
                    }
                });
            } else {
                res.redirect("/getwallet")
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/walletsuc", (req, res) => {
    res.render("walletsuc");
});

app.get("/addbalance", (req, res) => {
    if (req.isAuthenticated()) {
        Wallet.findOne({ userID: req.user._id }, function (err, foundWallet) {
            if (!err) {
                if (foundWallet != null) {
                    res.render("addbalance");
                } else {
                    res.redirect('/wallet');
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.post("/addbalance-checkout-session", async function (req, res) {
    if (req.isAuthenticated()) {
        const YOUR_DOMAIN = process.env.DOMAIN;
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        unit_amount: req.body.amount * 100,
                        currency: 'inr',
                        product: 'prod_O1hhae38W2RXTW'
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            allow_promotion_codes: true,
            success_url: `${YOUR_DOMAIN}/addbalancetrue?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_DOMAIN}/addbalancefalse?session_id={CHECKOUT_SESSION_ID}`,
        });
        res.redirect(303, session.url);
        const newWalletTransaction = new WalletTransaction({
            userID: req.user._id,
            amount: req.body.amount,
            type: "credit",
            status: "initiated",
            paymentID: session.id
        });
        newWalletTransaction.save();
    } else {
        res.redirect("/login");
    }
});

app.get("/addbalancetrue", (req, res) => {
    if (req.isAuthenticated()) {
        const sessionId = req.query.session_id; // Retrieve the session ID from the URL parameter
        stripe.checkout.sessions.retrieve(sessionId, (err, session) => {
            if (!err) {
                if (session.payment_status === "paid"){
                    WalletTransaction.findOne({ paymentID: req.query.session_id, status: "initiated" }, function (err, foundTransaction) {
                        if (!err) {
                            if (foundTransaction != null) {
                                Wallet.updateOne({ userID: foundTransaction.userID, },
                                    { $inc: { balance: foundTransaction.amount } }, { new: true }, function (err) {
                                        if (!err) {
                                            WalletTransaction.findOneAndUpdate({ _id: foundTransaction._id, status: "initiated" }, { status: "completed" }, function (err) {
                                                if (!err) {
                                                    res.render("wallet-r-success", { amount: foundTransaction.amount });
                                                    const template1 = fs.readFileSync('email-temps/walletcredittemplate.ejs', 'utf8');
                                                    const data1 = {
                                                        name: req.user.name,
                                                        amount: foundTransaction.amount
                                                    };
                                                    const html1 = ejs.render(template1, data1);
                                                    const mailOptions1 = {
                                                        from: process.env.MAIL_ID,
                                                        to: req.user.email,
                                                        subject: 'Wallet Update',
                                                        html: html1
                                                    };
                                                    transporter.sendMail(mailOptions1, (error, info) => {
                                                        if (!error) {
                                                            //do nothing
                                                        } else {
                                                            console.log(error);
                                                        }
                                                    });
                                                } else {
                                                    console.log(err);
                                                }
                                            });
                                        } else {
                                            console.log(err);
                                        }
                                    });
                            } else {
                                res.redirect("/wallet")
                            }
                        } else {
                            console.log(err);
                        }
                    });
                } else {
                    res.redirect(`/addbalancefalse?session_id=${sessionId}`)
                }
            } else {
                console.log("Error retrieving session " , err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/addbalancefalse", function (req, res) {
    if (req.isAuthenticated()) {
        const sessionId = req.query.session_id;
        if (sessionId != null) {
            WalletTransaction.findOneAndDelete({ userID: req.user._id, paymentID: sessionId }, function (err) {
                if (!err) {
                    res.render("wallet-r-fail");
                } else {
                    console.log(err);
                }
            });
        } else {
            res.redirect("/")
        }
    } else {
        res.redirect("/login")
    }
});

//////Wallet Section code <Ends Here>

////// GIFT CARD Section code <Starts Here>


app.get("/addgiftcard", function (req, res) {
    if (req.isAuthenticated()) {
        Wallet.findOne({ userID: req.user._id }, function (err, userWallet) {
            if (userWallet != null) {
                res.render("addgiftcard" , {balance : userWallet.balance,success : false , err : false});
            } else {
                res.redirect("/wallet");
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/buygiftcard", function (req, res) {
    if (req.isAuthenticated()) {
        Wallet.findOne({ userID: req.user._id }, function (err, userWallet) {
            if (userWallet != null) {
                res.render("buygiftcard");
            } else {
                res.redirect("/wallet");
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.post("/addgiftcard" , function(req,res){
    if (req.isAuthenticated()){
        GiftCard.findOne({cardID : req.body.id , cardPin : req.body.pin , status : "open"} , function(err , foundCard){
            if (!err) {
                if (foundCard!= null){
                    Wallet.updateOne({ userID: foundCard.userID, },
                        { $inc: { balance: foundCard.faceValue } }, { new: true }, function (err) {
                            if (!err) {
                                GiftCard.updateOne({_id : foundCard._id} , {status : "redeemed"} , function(err){
                                    if (!err) {
                                        Wallet.findOne({userID : req.user._id} , function(err , foundWallet){
                                            if (!err) {
                                                res.render("addgiftcard" , {balance : foundWallet.balance , success : true ,amount : foundCard.faceValue , err : false})
                                            } else {
                                                console.log(err);
                                            }
                                        });
                                    } else {
                                        console.log(err);
                                    }
                                });
                            } else {
                                console.log(err);
                            }
                        })
                } else {
                    Wallet.findOne({userID : req.user._id} , function(err , foundWallet){
                        if (!err) {
                            res.render("addgiftcard" , {balance : foundWallet.balance ,success : false, err : true})
                        } else {
                            console.log(err);
                        }
                    });
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

//////GIFT CARD Section code <Ends Here>


app.get("/sign-in-success", function (req, res) {
    if (req.isAuthenticated()) {
        const origin = req.cookies.origin;
        const destination = req.cookies.destination;
        const d_date = req.cookies.journeyDate;
        if (origin != null && destination != null && d_date != null) {
            SearchQ.findOneAndDelete({ userID: req.user._id }, function (err) {
                if (!err) {
                    const searchq = new SearchQ({
                        userID: req.user._id,
                        date: d_date
                    });
                    searchq.save();
                } else {
                    console.log(err);
                    res.redirect("/");
                }
            });
            performBusSearch(origin, destination, d_date)
                .then(searchData => {
                    res.render('options', {
                        foundBuses: searchData,
                        ct: '',
                        origin: origin,
                        destination: destination,
                        date: d_date,
                        loggedIn : true
                    });
                })
                .catch(error => {
                    res.render("swr");
                    console.log(error);
                });
        } else {
            res.redirect("/");
        }
    } else {
        res.redirect("/login");
    }
});

app.post("/search=q?", (req, res) => {
    serviceCheck(todayDate, currentTime);
    BookingsCheck();
    if (req.isAuthenticated()) {
        var today = new Date();
        var time = today.getHours() + ":" + today.getMinutes();
        var origin = req.body.origin;
        var destination = req.body.destination;
        var d_date = req.body.d_date;
        let yourDate = new Date()
        let d = yourDate.toISOString().split('T')[0];
        SearchQ.findOneAndDelete({ userID: req.user._id }, function (err) {
            if (!err) {
                const searchq = new SearchQ({
                    userID: req.user._id,
                    date: d_date
                });
                searchq.save();
            } else {
                console.log(err);
                res.redirect("/");
            }
        });
        Service.find({ origin: req.body.origin, destination: req.body.destination, service_date: req.body.d_date }, function (err, foundBuses) {
            if (!err) {
                if (d === d_date) {
                    res.render("options", { foundBuses: foundBuses, ct: time, origin: req.body.origin, destination: req.body.destination, date: req.body.d_date , loggedIn : true });
                } else {
                    res.render("options", { foundBuses: foundBuses, ct: "", origin: req.body.origin, destination: req.body.destination, date: req.body.d_date , loggedIn : true});
                }
            } else {
                console.log(err);
            }
        });
    } else {
        Service.find({ origin: req.body.origin, destination: req.body.destination, service_date: req.body.d_date }, function (err, foundBuses) {
            if (!err) {
                res.render("options", { foundBuses: foundBuses, ct: "", origin: req.body.origin, destination: req.body.destination, date: req.body.d_date , loggedIn : false });
            } else {
                console.log(err);
            }
        });
    }
});


function performBusSearch(origin, destination, d_date) {
    return new Promise((resolve, reject) => {
        Service.find(
            { origin: origin, destination: destination, service_date: d_date },
            function (err, foundBuses) {
                if (!err) {
                    resolve(foundBuses);
                } else {
                    reject(err);
                }
            }
        );
    });
}

app.post("/seatchoose", function (req, res) {
    if (req.isAuthenticated()) {
        SearchQ.findOneAndUpdate({ userID: req.user._id }, { serviceNo: req.body.g_service_no }, function (err) {
            if (!err) {
                SearchQ.findOne({ userID: req.user._id }, function (err, foundDetails) {
                    if (!err) {
                        Service.findOne({ service_no: foundDetails.serviceNo, service_date: foundDetails.date }, (err, bus) => {
                            if (err) {
                                console.error(err);
                                return;
                            }
                            // Extract seat numbers with seat status as "disabled"
                            const disabledSeatNumbers = bus.seat
                                .filter(seat => seat.seat_status === 'disabled')
                                .map(seat => seat.seat_no);
                            res.render("test", { blockedSeats: disabledSeatNumbers, type: bus.type, err: false });
                        });
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        Service.findOne({ _id: req.body.g_service_id }, (err, bus) => {
            if (err) {
                console.error(err);
                return;
            }
            // Extract seat numbers with seat status as "disabled"
            const disabledSeatNumbers = bus.seat
                .filter(seat => seat.seat_status === 'disabled')
                .map(seat => seat.seat_no);
            res.render("test", { blockedSeats: disabledSeatNumbers, type: bus.type, err: false });
        });
    }
});

app.post("/seatselected", function (req, res) {
    if (req.isAuthenticated()) {
        const selectedSeats = JSON.parse(req.body.selectedSeats);
        SearchQ.findOneAndUpdate({ userID: req.user._id }, { seats: selectedSeats }, function (err) {
            if (!err) {
                SearchQ.findOne({ userID: req.user._id }, function (err, foundDetails) {
                    if (!err) {
                        Service.findOne({ service_no: foundDetails.serviceNo, service_date: foundDetails.date }, function (err, foundService) {
                            if (!err) {
                                if (foundService != null) {
                                    res.render("seat", { service: foundService, a: false, type: foundService.type });
                                } else {
                                    res.redirect("/");
                                }
                            } else {
                                console.log(err);
                            }
                        })
                    } else {
                        console.log(err);
                    }
                })
            } else {
                console.log(err);
            }
        })
    } else {
        res.redirect("/login")
    }
});



app.post("/seatbooking", (req, res) => {
    if (req.isAuthenticated()) {
        TempD.findOneAndDelete({ userID: req.user._id }, function (err) {
            if (!err) {
                SearchQ.findOne({ userID: req.user._id }, function (err, foundsearch) {
                    if (!err) {
                        Service.findOne({ service_no: foundsearch.serviceNo, service_date: foundsearch.date }, function (err, foundService) {
                            if (!err) {
                                const gotService = foundService;
                                var a = foundsearch.seats.length * gotService.fare;
                                var f = a.toString();
                                const newTempD = new TempD({
                                    userID: req.user._id,
                                    bookingID: "EZB" + generateUniqueId({ length: 7, useLetters: false }),
                                    origin: gotService.origin,
                                    destination: gotService.destination,
                                    service_no: gotService.service_no,
                                    dep_date: gotService.service_date,
                                    dep_time: gotService.dep_time,
                                    arr_time: gotService.arr_time,
                                    boarding_point: req.body.boarding_point,
                                    drop_point: req.body.drop_point,
                                    bus_type: gotService.bus_type,
                                    pax_name: req.body.pax_name,
                                    pax_phone: req.body.pax_phone,
                                    pax_age: req.body.pax_age,
                                    pax_gender: req.body.pax_gender,
                                    seats: foundsearch.seats,
                                    bill_amount: f
                                });
                                newTempD.save(function (err) {
                                    if (!err) {
                                        TempD.findOne({ userID: req.user._id }, function (err, foundDetails) {
                                            if (!err) {
                                                res.render("reviewd", { details: foundDetails });
                                            } else {
                                                console.log(err);
                                            }
                                        })
                                    } else {
                                        console.log(err);
                                    }
                                });
                            } else {
                                console.log(err);
                            }

                        });
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.post("/back", function (req, res) {
    if (req.isAuthenticated()) {
        SearchQ.findOne({ userID: req.user._id }, function (err, foundDetails) {
            if (!err) {
                if (foundDetails != null) {
                    Service.findOne({ service_no: foundDetails.serviceNo, service_date: foundDetails.date }, function (err, foundService) {
                        if (!err) {
                            Service.find({ origin: foundService.origin, destination: foundService.destination, service_date: foundDetails.date }, function (err, foundBuses) {
                                if (!err) {
                                    res.render("options", { foundBuses: foundBuses, ct: "", origin: foundService.origin, destination: foundService.destination, date: foundDetails.date });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            console.log(err);
                        }
                    });
                } else {
                    res.redirect('/');
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/");
    }
});

app.post("/backtoseat", function (req, res) {
    if (req.isAuthenticated()) {
        TempD.findOneAndDelete({ userID: req.user_id }, function (err) {
            if (!err) {
                SearchQ.findOne({ userID: req.user._id }, function (err, foundDetails) {
                    if (!err) {
                        Service.findOne({ service_no: foundDetails.serviceNo, service_date: foundDetails.date }, (err, bus) => {
                            if (err) {
                                console.error(err);
                                return;
                            }
                            const disabledSeatNumbers = bus.seat
                                .filter(seat => seat.seat_status === 'disabled')
                                .map(seat => seat.seat_no);
                            res.render("test", { blockedSeats: disabledSeatNumbers, type: bus.type, err: false });
                        });
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login")
    }
});

app.post("/paymentform", function (req, res) {
    if (req.isAuthenticated()) {
        TempD.findOne({ userID: req.user._id }, function (err, foundD) {
            if (!err) {
                if (foundD != null) {
                    Wallet.findOne({ userID: req.user._id }, function (err, foundWallet) {
                        if (!err) {
                            if (foundWallet != null) {
                                res.render("paymentmethod", { foundD: foundD, wallet: foundWallet });
                            } else {
                                res.render("paymentmethod", { foundD: foundD, wallet: null });
                            }
                        } else {
                            console.log(err);
                        }
                    });
                } else {
                    res.redirect("/")
                }
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login")
    }
});

app.post("/checkout-wallet", function (req, res) {
    if (req.isAuthenticated()) {
        const time = new Date().getTime().toString();
        TempD.findOne({ userID: req.user._id }, async (err, foundD) => {
            if (!err) {
                TempD.find({ service_no: foundD.service_no, dep_date: foundD.dep_date, seats: { $in: foundD.seats } }, async function (err, foundItem) {
                    if (!err) {
                        if (foundItem.length > 1) {
                            TempD.findOneAndDelete({ userID: req.user_id }, function (err) {
                                if (!err) {
                                    SearchQ.findOne({ userID: req.user._id }, function (err, foundDetails) {
                                        if (!err) {
                                            Service.findOne({ service_no: foundDetails.serviceNo, service_date: foundDetails.date }, (err, bus) => {
                                                if (err) {
                                                    console.error(err);
                                                    return;
                                                }
                                                // Extract seat numbers with seat status as "disabled"
                                                const disabledSeatNumbers = bus.seat
                                                    .filter(seat => seat.seat_status === 'disabled')
                                                    .map(seat => seat.seat_no);
                                                res.render("test", { blockedSeats: disabledSeatNumbers, type: bus.type, err: true });
                                            });
                                        } else {
                                            console.log(err);
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            const inInt = parseInt(foundD.bill_amount);
                            Wallet.findOne({ userID: foundD.userID }, function (err, foundWallet) {
                                if (foundWallet.balance >= inInt) {
                                    const newArray = foundD.seats;
                                    newArray.forEach(function (element) {
                                        Service.updateOne(
                                            { service_no: foundD.service_no, service_date: foundD.dep_date, 'seat.seat_no': element },
                                            { $set: { 'seat.$.seat_status': 'disabled' } },
                                            function (err, count) {
                                                if (!err) {
                                                    // do nothing
                                                } else {
                                                    console.log(err);
                                                }
                                            });
                                    });
                                    Wallet.updateOne({ userID: foundD.userID, },
                                        { $inc: { balance: -inInt } }, { new: true }, function (err) {
                                            if (!err) {
                                                const template1 = fs.readFileSync('email-temps/walletdebittemplate.ejs', 'utf8');
                                                const data1 = {
                                                    name: req.user.name,
                                                    amount: inInt
                                                };
                                                const html1 = ejs.render(template1, data1);
                                                const mailOptions1 = {
                                                    from: process.env.MAIL_ID,
                                                    to: req.user.email,
                                                    subject: 'Wallet Update',
                                                    html: html1
                                                };
                                                transporter.sendMail(mailOptions1, (error, info) => {
                                                    if (!error) {
                                                        //do nothing
                                                    } else {
                                                        console.log(error);
                                                    }
                                                });
                                                const bookingDate = getCurrentDate();
                                                const newBooking = new Booking({
                                                    userID: foundD.userID,
                                                    bookingID: foundD.bookingID,
                                                    transactionID: "ewtr_0" + generateUniqueId({ length: 28, useLetters: true }),
                                                    paymentMethod: "wallet",
                                                    bookingDate: bookingDate,
                                                    bookingTime: time,
                                                    bookingStatus: "paid",
                                                    service_no: foundD.service_no,
                                                    bus_type: foundD.bus_type,
                                                    origin: foundD.origin,
                                                    destination: foundD.destination,
                                                    journeyDate: foundD.dep_date,
                                                    dep_time: foundD.dep_time,
                                                    arr_time: foundD.arr_time,
                                                    boarding_point: foundD.boarding_point,
                                                    drop_point: foundD.drop_point,
                                                    pax_name: foundD.pax_name,
                                                    pax_age: foundD.pax_age,
                                                    pax_phone: foundD.pax_phone,
                                                    pax_gender: foundD.pax_gender,
                                                    seats: foundD.seats,
                                                    fare: foundD.bill_amount
                                                });
                                                newBooking.save(function (err) {
                                                    if (!err) {
                                                        res.redirect("/paymentsuccess=q?");
                                                    } else {
                                                        res.redirect("/paymentfailure=q?");
                                                    }
                                                });
                                            } else {
                                                console.log(err);
                                            }
                                        });
                                } else {
                                    res.redirect("/paymentfailure=q?");
                                }
                            });
                        }
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login")
    }
});

app.post("/create-giftcard-checkout" , async (req,res) => {
    if (req.isAuthenticated()){
        const YOUR_DOMAIN = process.env.DOMAIN;
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        unit_amount: parseInt(req.body.faceValue) * 100,
                        currency: 'inr',
                        product: 'prod_O95V7g9ZJfjvKJ'
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            allow_promotion_codes: true,
            success_url: `${YOUR_DOMAIN}/paymentgiftcardtrue?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_DOMAIN}/paymentgiftcardfalse?session_id={CHECKOUT_SESSION_ID}`,
        });
        const newGiftCard = new GiftCard ({
            userID : req.user._id,
            cardID : (generateUniqueId({ length: 4, useLetters: true }) + "-" + generateUniqueId({ length: 6, useLetters: true }) + "-" + generateUniqueId({ length: 5, useLetters: true })).toUpperCase(),
            cardPin : generateUniqueId({length : 6 , useLetters : false}),
            faceValue : req.body.faceValue,
            recName : req.body.name,
            recEmail : req.body.email,
            recMsg : req.body.giftMsg,
            paymentID : session.id
        });
        newGiftCard.save();
        res.redirect(303, session.url);
    } else {
        res.redirect("/login");
    }
});

app.get("/paymentgiftcardtrue" , function(req,res){
    if (req.isAuthenticated()){
        const sessionId = req.query.session_id;
        stripe.checkout.sessions.retrieve(sessionId, (err, session) => {
            if (!err) {
                if (session.payment_status ===  "paid"){
                    GiftCard.findOneAndUpdate({paymentID : sessionId , paymentStatus : "initiated"} , {paymentStatus : "completed"} , function(err){
                        if (!err) {
                            GiftCard.findOne({paymentID : sessionId} , function(err , foundCard){
                                if (!err) {
                                    res.render("gcpsuc" , {giftCard : foundCard});
                                    const template = fs.readFileSync('email-temps/giftcardtemplate.ejs', 'utf8');
                                    const data = {
                                        name : foundCard.recName,
                                        code : foundCard.cardID,
                                        pin : foundCard.cardPin,
                                        msg : foundCard.recMsg,
                                        faceValue : foundCard.faceValue,
                                        from : req.user.name
                                    };
                                    const html = ejs.render(template, data);
                                    const mailOptions = {
                                        from: process.env.MAIL_ID,
                                        to: foundCard.recEmail,
                                        subject: 'Gift Voucher Details',
                                        html: html
                                    };
                                    transporter.sendMail(mailOptions, (error, info) => {
                                        if (!error){
                                            //do nothing
                                        } else {
                                            console.log(error);
                                        }
                                    })
                                } else {
                                    console.log(err);
                                }
                            })
                        } else {
                            res.redirect("/")
                        }
                    });
                } else {
                    res.redirect(`/paymentgiftcardfalse?session_id={${sessionId}}`)
                }
            } else {
                console.log("Error retrieving session" , err);
            }
        });
    } else {
        res.redirect("/login")
    }
});

app.get("/paymentgiftcardfalse" , function(req,res){
    if (req.isAuthenticated()){
        const sessionId = req.query.session_id;
        GiftCard.findOneAndDelete({paymentID : sessionId} , function(err){
            if (!err){
                res.render("gcpfail");
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login")
    }
});


app.post("/create-checkout-session", async (req, res) => {
    if (req.isAuthenticated()) {
        const time = new Date().getTime().toString();
        const YOUR_DOMAIN = process.env.DOMAIN;
        TempD.findOne({ userID: req.user._id }, async (err, foundD) => {
            if (!err) {
                TempD.find({ service_no: foundD.service_no, dep_date: foundD.dep_date, seats: { $in: foundD.seats } }, async function (err, foundItem) {
                    if (!err) {
                        if (foundItem.length > 1) {
                            TempD.findOneAndDelete({ userID: req.user_id }, function (err) {
                                if (!err) {
                                    SearchQ.findOne({ userID: req.user._id }, function (err, foundDetails) {
                                        if (!err) {
                                            Service.findOne({ service_no: foundDetails.serviceNo, service_date: foundDetails.date }, (err, bus) => {
                                                if (err) {
                                                    console.error(err);
                                                    return;
                                                }
                                                // Extract seat numbers with seat status as "disabled"
                                                const disabledSeatNumbers = bus.seat
                                                    .filter(seat => seat.seat_status === 'disabled')
                                                    .map(seat => seat.seat_no);
                                                res.render("test", { blockedSeats: disabledSeatNumbers, type: bus.type, err: true });
                                            });
                                        } else {
                                            console.log(err);
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            const newArray = foundD.seats;
                            newArray.forEach(function (element) {
                                Service.updateOne(
                                    { service_no: foundD.service_no, service_date: foundD.dep_date, 'seat.seat_no': element },
                                    { $set: { 'seat.$.seat_status': 'disabled' } },
                                    function (err, count) {
                                        if (!err) {
                                            // do nothing
                                        } else {
                                            console.log(err);
                                        }
                                    });
                            });
                            const session = await stripe.checkout.sessions.create({
                                line_items: [
                                    {
                                        price_data: {
                                            unit_amount: parseInt(foundD.bill_amount) * 100,
                                            currency: 'inr',
                                            product: 'prod_NhWAevU90Rtp8X'
                                        },
                                        quantity: 1,
                                    },
                                ],
                                mode: 'payment',
                                allow_promotion_codes: true,
                                success_url: `${YOUR_DOMAIN}/paymentsuccess=q?`,
                                cancel_url: `${YOUR_DOMAIN}/paymentfailure=q?`,
                            });
                            const sessionId = session.id;
                            const bookingDate = getCurrentDate();
                            const newBooking = new Booking({
                                userID: foundD.userID,
                                bookingID: foundD.bookingID,
                                transactionID: sessionId,
                                bookingDate: bookingDate,
                                bookingTime: time,
                                bookingStatus: "initiated",
                                service_no: foundD.service_no,
                                bus_type: foundD.bus_type,
                                origin: foundD.origin,
                                destination: foundD.destination,
                                journeyDate: foundD.dep_date,
                                dep_time: foundD.dep_time,
                                arr_time: foundD.arr_time,
                                boarding_point: foundD.boarding_point,
                                drop_point: foundD.drop_point,
                                pax_name: foundD.pax_name,
                                pax_age: foundD.pax_age,
                                pax_phone: foundD.pax_phone,
                                pax_gender: foundD.pax_gender,
                                seats: foundD.seats,
                                fare: foundD.bill_amount
                            });
                            newBooking.save();
                            res.redirect(303, session.url);
                        }
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});



app.get("/paymentsuccess=q?", (req, res) => {
    if (req.isAuthenticated()) {
        TempD.findOne({ userID: req.user._id }, async function (err, foundD) {
            if (!err) {
                Booking.findOne({ bookingID: foundD.bookingID }, function (err, foundBooking) {
                    if (!err) {
                        if (foundBooking.paymentMethod === "wallet") {
                            User.findOne({ _id: foundBooking.userID }, function (err, foundUser) {
                                if (!err) {
                                    const template = fs.readFileSync('email-temps/bookconfirmtemplate.ejs', 'utf8');
                                    const data = {
                                        name: foundUser.name,
                                        bookingID: foundBooking.bookingID,
                                        source: foundBooking.origin,
                                        destination: foundBooking.destination,
                                        fare: foundBooking.fare,
                                        paymentMethod: foundBooking.paymentMethod,
                                        serviceNo: foundBooking.service_no,
                                        journeyDate: foundBooking.journeyDate,
                                        dep_time: foundBooking.dep_time,
                                        seats: foundBooking.seats
                                    };
                                    const html = ejs.render(template, data);
                                    const mailOptions = {
                                        from: process.env.MAIL_ID,
                                        to: foundUser.email,
                                        subject: 'Booking Confirmation',
                                        html: html
                                    };
                                    transporter.sendMail(mailOptions, (error, info) => {
                                        if (error) {
                                            console.log('Error occurred:', error.message);
                                        } else {
                                            res.render("bookingsuccess", { Booking: foundD });
                                            generateInvoice(foundBooking , req.user)
                                            .then(pdfBuffer => {
                                              const s3 = new AWS.S3();
                                              const bucketName = process.env.AWS_BUCKET_NAME;
                                              const folderName = 'invoices';
                                              const fileName = `${foundBooking.bookingID}.pdf`;
                                          
                                              const params = {
                                                Bucket: bucketName,
                                                Key: folderName + '/' + fileName,
                                                Body: pdfBuffer
                                              };
                                          
                                              s3.upload(params, (err, data) => {
                                                if (err) {
                                                  console.error('Error uploading to S3:', err);
                                                } else {
                                                    // invoice uploaded to s3
                                                }
                                              });
                                            })
                                            .catch(error => {
                                              console.error('Error generating Invoice:', error);
                                            });
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            stripe.checkout.sessions.retrieve(foundBooking.transactionID, (err, session) => {
                                if (!err) {
                                    if (session.payment_status === "paid") {
                                        User.findOne({ _id: foundBooking.userID }, function (err, foundUser) {
                                            if (!err) {
                                                const template = fs.readFileSync('email-temps/bookconfirmtemplate.ejs', 'utf8');
                                                const data = {
                                                    name: foundUser.name,
                                                    bookingID: foundBooking.bookingID,
                                                    source: foundBooking.origin,
                                                    destination: foundBooking.destination,
                                                    fare: foundBooking.fare,
                                                    paymentMethod: foundBooking.paymentMethod,
                                                    serviceNo: foundBooking.service_no,
                                                    journeyDate: foundBooking.journeyDate,
                                                    dep_time: foundBooking.dep_time,
                                                    seats: foundBooking.seats
                                                };
                                                const html = ejs.render(template, data);
                                                const mailOptions = {
                                                    from: process.env.MAIL_ID,
                                                    to: foundUser.email,
                                                    subject: 'Booking Confirmation',
                                                    html: html
                                                };
                                                transporter.sendMail(mailOptions, (error, info) => {
                                                    if (error) {
                                                        console.log('Error occurred:', error.message);
                                                    } else {
                                                        res.render("bookingsuccess", { Booking: foundD });
                                                        generateInvoice(foundBooking , req.user)
                                                        .then(pdfBuffer => {
                                                          const s3 = new AWS.S3();
                                                          const bucketName = process.env.AWS_BUCKET_NAME;
                                                          const folderName = 'invoices';
                                                          const fileName = `${foundBooking.bookingID}.pdf`;
                                                      
                                                          const params = {
                                                            Bucket: bucketName,
                                                            Key: folderName + '/' + fileName,
                                                            Body: pdfBuffer
                                                          };
                                                      
                                                          s3.upload(params, (err, data) => {
                                                            if (err) {
                                                              console.error('Error uploading to S3:', err);
                                                            } else {
                                                              console.log('Invoice uploaded successfully:', data.Location);
                                                            }
                                                          });
                                                        })
                                                        .catch(error => {
                                                          console.error('Error generating Invoice:', error);
                                                        });
                                                    }
                                                });
                                            } else {
                                                console.log(err);
                                            }
                                        });
                                        Booking.findOneAndUpdate({ bookingID: foundD.bookingID }, { bookingStatus: "paid" }, function (err) {
                                            if (!err) {
                                                TempD.findOneAndDelete({ userID: req.user._id }, function (err) {
                                                    if (!err) {
                                                        SearchQ.findOneAndDelete({ userID: req.user._id }, function (err) {
                                                            if (!err) {
                                                                //do nothing
                                                            } else {
                                                                console.log(err);
                                                            }
                                                        });
                                                    } else {
                                                        console.log(err);
                                                    }
                                                });
                                            } else {
                                                console.log(err);
                                            }
                                        });
                                    } else {
                                        res.redirect("/paymentfailure=q?")
                                    }
                                } else {
                                    res.render("swr");
                                }
                            });
                        }
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log(err);
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/paymentfailure=q?", (req, res) => {
    if (req.isAuthenticated()) {
        TempD.findOneAndDelete({ userID: req.user._id }, function (err) {
            if (!err) {
                //do nothing
            } else {
                console.log(err);
            }
        });
        res.render("bookingfail");
    } else {
        res.redirect("/login");
    }
});

app.get("/seats", function (req, res) {
    res.render("test");
});
app.use(bodyParser.json());
app.post("/seats", function (req, res) {
    const a = req.body.selectedSeats;
    const b = JSON.parse(a);
    console.log(b);

});

app.use((req, res, next) => {
    res.status(404).render("404");
});

connectDB().then(() => {
    console.log("eazybusDB CONNECTED SUCCESFULLY");
    app.listen(process.env.PORT || 3000, () => {
        console.log("eazybus Server STARTED");
    });
});

