const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
  },
  image: {
    type: String,
  },
  imageBanner: {
    type: String,
  },
  phone: {
    type: String,
    // minlength: 9,
  },
  email: {
    type: String,
    require: true,
  },
  password: {
    type: String,
    minlength: 6,
  },
  verified: {
    type: Boolean,
    default: false
  },
  tokenDevice: {
    type: String
  },
  role: {
    type: Number,
    default: 0
  },// role
  // 0 : người nghe
  // 1 : pro
  // 2 : admin
  OTP: { type: String },
  testOTP: { type: String, select: false },
  OTPCreatedTime: { type: Date },
  OTPAttempts: { type: Number, default: 0 },
  isBlocked: { type: Boolean, default: false },
  blockUntil: { type: Date },
  loginAttempts: { type: Number, default: 0 },

  uploadedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }],
  playlists: [{ type: mongoose.Schema.Types.ObjectId, ref: "Playlist" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true })
module.exports = mongoose.model("User", userSchema);

