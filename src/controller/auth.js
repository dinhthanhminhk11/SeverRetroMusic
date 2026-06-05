
import User from '../models/user';
import { formatResponseError, formatResponseSuccess, formatResponseSuccessNoData } from '../config';
import { rules } from '../constants/rules';
import album from '../models/album';
import song from '../models/song';
import protobuf from "protobufjs";
const RevokedToken = require("../models/revokedToken");
const Logger = require("../util/logger");
const Constants = require('../util/constants')
const config = require('../config/auth.config');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateOTP, sendOTP } = require("../util/otp");
const encrypt = require('../../build/Release/addon');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');
const unlinkFile = util.promisify(fs.unlink);
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});


const logger = new Logger(Constants.ON_OFF_SETTING_LOG_ENABLE);
const loggerSentOTP = new Logger(Constants.ON_OFF_SETTING_LOG_OTP);

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed!'), false);
    }
};
const upload = multer({ storage, fileFilter });

const root = protobuf.loadSync(path.join(__dirname, "../../proto/auth.proto"));
const AuthRequest = root.lookupType("AuthRequest");
const ErrorResponse = root.lookupType("ErrorResponse");
const SuccessResponse = root.lookupType("SuccessResponse");

class Auth {
    async testLogin(req, res) {
        try {
            logger.error("tool encrypt data")
            // const text = "{\"email\" : \"quanvd31102002@gmail.com\" , \"password\" : \"quan3110\"}"
            const text = "{\"fullName\" : \"Minh Madlife\" , \"phone\" : \"0369069842\"}"
            // const text = "{\"email\" : \"dinhthanhminhk11@gmail.com\"}"
            // const text = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3Y2MwODk0OTc1YTFlZmY3ZmNmY2FiMiIsImlhdCI6MTc0MTU5MjI2MSwiZXhwIjoxNzQyMTk3MDYxfQ.KxK6uUNfyZwP4d9hR2YnmSRKwzcRfKOwQRI7jjy1tyo"
            let textEncrpyt = encrypt.encryptData(text)

            let textDecrypt = encrypt.decryptData("pJujPmIyCMj7cZZOCegQP/KyrfI6xhF1UcZyGEUW2w1e70NF6tGHdZfF0I9kX3i1TdmvXL7KN0zG2PwVKww6Eix2u+g4mAh2IuyAPjZfdaMu1GIindMKsw5NILrDXNvdF6E7ScERRnZGBBObIevq8oYIA2jTHmFvnsn/1Y76hWZ8YL7IRFkyBRRBf1xC0iDpF4xKxJHYODHWWzv6DFf+SDk2NjLE635UkuCAhq68gmk=")

            try {
                // const { email, password } = JSON.parse(textDecrypt);



                // const user = await User.findOne({ email }).lean();
                // const accessToken = "xyz123token"

                // const text = formatUserData({}, accessToken)

                logger.error(text);
                return res.status(200).json({
                    "textEncrpyt": textDecrypt
                })



            } catch (error) {
                return res.status(404).json({
                    "textEncrpyt": "❌ Dữ liệu không phải JSON hợp lệ"
                })
            }
            return res.status(200).json({
                "textEncrpyt": textEncrpyt
            })

        } catch (error) {
            logger.error('register', error);
            return res.status(400).json(formatResponseError({ code: '404' }, false, 'Lỗi đăng kí'));
        }
    }

    async register(req, res) {
        try {
            const { email } = req.decryptedData;
            logger.warn("email " + email)
            const OTP = generateOTP();
            const hashedOTP = bcrypt.hashSync(OTP, 10);
            const user = new User({ email, OTP: hashedOTP });

            await user.save();
            loggerSentOTP.info("OTP sent: " + OTP);
            if (Constants.ON_OFF_SETTING_SENT_MAIL_OTP) {
                try {
                    await sendOTP(email, OTP);
                } catch (err) {
                    return res.status(500).send(ErrorResponse.encode({
                        success: false,
                        error: {
                            code: Constants.OTP_SEND_FAIL,
                            message: "Failed to send OTP"
                        }
                    }).finish());
                }
            }

            const response = SuccessResponse.encode({
                success: true,
                data: {
                    code: Constants.USER_REGISTER_SUCCESS,
                    message: "User registered successfully.",
                    details: { verified: user.verified }
                }
            }).finish();

            return res.status(200).send(response);

        } catch (error) {
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                code: Constants.SERVER_ERROR,
                message: "Internal Server Error"
            }).finish());
        }
    }

    async gennerateOTP(req, res) {
        try {
            logger.warn("=========================================");
            logger.warn("Call gennerateOTP");

            let request;
            try {
                const buffer = req.body;
                request = AuthRequest.decode(new Uint8Array(buffer));
            } catch (err) {
                logger.error("INVALID_PROTOBUF " + err)
                return res.status(400).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.INVALID_PROTOBUF,
                        message: "Invalid Protobuf format"
                    }
                }).finish());
            }

            const { data } = request;

            if (!data) {
                return res.status(400).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.DATA_MISSING,
                        message: "Missing request data"
                    }
                }).finish());
            }

            let decryptedData;
            try {
                decryptedData = JSON.parse(encrypt.decryptData(data));
            } catch (err) {
                return res.status(400).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.DATA_NOT_DECRYPT,
                        message: "Invalid decrypted data format"
                    }
                }).finish());
            }

            const { email, type } = decryptedData;

            if (!email || typeof email !== "string") {
                return res.status(400).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_MISSING,
                        message: "Email is required"
                    }
                }).finish());
            }

            if (!isValidEmail(email)) {
                return res.status(400).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_NOT_FORMAT,
                        message: "Not a valid email address" 
                    }
                }).finish());
            }

            const user = await User.findOne({ email }).lean();
            const currentTime = new Date();
            if (!user) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_DOSE_NOT_EXISTS,
                        message: "Email does not exist"
                    }
                }).finish());
            }

            if (user.isBlocked && currentTime < user.blockUntil) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.ACCOUNT_LOCKED,
                        message: "Account locked. Try it after a while."
                    }
                }).finish());
            }

            if (user.OTPCreatedTime && (currentTime.getTime() - user.OTPCreatedTime.getTime() < 60000)) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.OTP_LIMIT,
                        message: "Requires a minimum of 1 minute interval between OTP requests."
                    }
                }).finish());
            }

            const OTP = generateOTP();
            const hashedOTP = bcrypt.hashSync(OTP, 10);
            await User.updateOne(
                { email },
                {
                    $set: {
                        OTP: hashedOTP,
                        OTPCreatedTime: currentTime,
                        ...(user.isBlocked ? { isBlocked: false, OTPAttempts: 0 } : {})
                    }
                }
            );

            if (Constants.ON_OFF_SETTING_SENT_MAIL_OTP) {
                try {
                    await sendOTP(email, OTP);
                } catch (err) {
                    return res.status(500).send(ErrorResponse.encode({
                        success: false,
                        error: {
                            code: Constants.OTP_SEND_FAIL,
                            message: "Failed to send OTP"
                        }
                    }).finish());
                }
            }

            loggerSentOTP.info("this is otp " + OTP)
            logger.warn("OTP sent successfully");

            const response = SuccessResponse.encode({
                success: true,
                data: {
                    code: Constants.OTP_RECENT_SUCCESS,
                    message: "OTP sent successfully."
                }
            }).finish()
            return res.status(200).send(response);

        } catch (err) {
            logger.error(err);
            res.status(500).send("Server error");
        }
    }

    async verifyOTP(req, res) {
        try {
            logger.warn("=========================================");
            logger.warn("Call verifyOTP");
            const { email, otp, type } = req.decryptedData;

            const currentTime = new Date();
            const user = await User.findOneAndUpdate(
                { email, role: { $in: [0, 1] } },
                {
                    $set: {
                        ...(currentTime >= user?.blockUntil ? { isBlocked: false, OTPAttempts: 0 } : {})
                    }
                },
                { new: true }
            );

            if (!user) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_DOSE_NOT_EXISTS,
                        message: "Email does not exist"
                    }
                }).finish());
            }

            if (user.isBlocked && currentTime < user.blockUntil) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.ACCOUNT_LOCKED,
                        message: "Account locked. Try it after a while."
                    }
                }).finish());
            }

            const checkOTP = bcrypt.compareSync(otp, user.OTP);


            if (!checkOTP) {
                const updateData = { $inc: { OTPAttempts: 1 } };

                if (user.OTPAttempts + 1 >= 5) {
                    updateData.$set = {
                        isBlocked: true,
                        blockUntil: new Date(currentTime.getTime() + 60 * 60 * 1000)
                    };
                }

                await User.updateOne({ email }, updateData);
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.OTP_NOT_VALID,
                        message: "OTP is not valid."
                    }
                }).finish());
            }

            if (user.OTPCreatedTime && (currentTime - user.OTPCreatedTime > 5 * 60 * 1000)) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.OTP_EXPIRED,
                        message: "OTP expired."
                    }
                }).finish());
            }

            const updatedUser = await User.findOneAndUpdate(
                { email },
                {
                    $unset: { OTP: "", OTPCreatedTime: "" },
                    $set: { verified: true, OTPAttempts: 0 }
                },
                { new: true }
            );

            let response

            if (type === Constants.TYPE_OTP_LOGIN) {
                const accessToken = jwt.sign({ id: updatedUser.id }, config.secret, { expiresIn: "7d" });
                const text = formatUserData({}, accessToken);

                response = SuccessResponse.encode({
                    success: true,
                    data: {
                        code: Constants.LOGIN_SUCCESS,
                        message: "Login successful.",
                        details: { data: encrypt.encryptData(text) }
                    }
                }).finish()
            } else {
                response = SuccessResponse.encode({
                    success: true,
                    data: {
                        code: Constants.OTP_CONFIRMED,
                        message: "Confirmed successfully.",
                        details: { type: type }
                    }
                }).finish()
            }

            return res.status(200).send(response);

        } catch (err) {
            logger.error(err);
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                code: Constants.SERVER_ERROR,
                message: "Internal Server Error"
            }).finish());
        }
    }

    async loginWithOtp(req, res) {
        try {
            logger.warn("=========================================");
            logger.warn("Call loginWithOtp");

            const { email } = req.decryptedData;
            const currentTime = new Date();

            const user = await User.findOneAndUpdate(
                { email, role: { $in: [0, 1] } },
                {
                    $set: {
                        ...(currentTime >= user?.blockUntil ? { isBlocked: false, OTPAttempts: 0 } : {})
                    }
                },
                { new: true }
            );

            if (!user) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_DOSE_NOT_EXISTS,
                        message: "Email does not exist"
                    }
                }).finish());
            }

            if (user.isBlocked && currentTime < user.blockUntil) {
                logger.error(`Account is locked until ${user.blockUntil}`);
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.ACCOUNT_LOCKED,
                        message: "Account locked. Try it after a while."
                    }
                }).finish());
            }

            if (user.OTPCreatedTime && (currentTime - user.OTPCreatedTime < 60000)) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.OTP_LIMIT,
                        message: "Requires a minimum of 1 minute interval between OTP requests."
                    }
                }).finish());
            }

            const OTP = generateOTP();
            const hashedOTP = bcrypt.hashSync(OTP, 10);

            loggerSentOTP.info(`Generated OTP for ${email}: ${OTP}`);

            const updateData = {
                $set: {
                    OTP: hashedOTP,
                    OTPCreatedTime: currentTime
                },
                $inc: { OTPAttempts: 1 }
            };

            if (user.OTPAttempts + 1 >= 5) {
                updateData.$set.isBlocked = true;
                updateData.$set.blockUntil = new Date(currentTime.getTime() + 60 * 60 * 1000);
            }

            await User.updateOne({ email }, updateData);

            if (Constants.ON_OFF_SETTING_SENT_MAIL_OTP) {
                try {
                    await sendOTP(email, OTP);
                } catch (err) {
                    return res.status(500).send(ErrorResponse.encode({
                        success: false,
                        error: {
                            code: Constants.OTP_SEND_FAIL,
                            message: "Failed to send OTP"
                        }
                    }).finish());
                }
            }

            logger.success(user.verified ? "Authenticated accounts can log in" : "Unverified accounts require authentication");

            if (!user.verified) {
                return res.status(403).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.ACCOUNT_CAN_NOT_LOGIN,
                        message: "Unverified accounts require authentication"
                    }
                }).finish());
            }

            const response = SuccessResponse.encode({
                success: true,
                data: {
                    code: Constants.ACCOUNT_CAN_LOGIN,
                    message: "Authenticated accounts can log in"
                }
            }).finish()
            return res.status(200).send(response);
        } catch (error) {
            console.error("LoginWithOtp Error:", error);
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                code: Constants.SERVER_ERROR,
                message: "Internal Server Error"
            }).finish());
        }
    }

    async loginWithPass(req, res) {
        try {
            logger.warn("=========================================");
            logger.warn("Call loginWithPass");

            const { email, password } = req.decryptedData;

            const currentTime = new Date();

            const user = await User.findOneAndUpdate(
                { email, role: { $in: [0, 1] } },
                {
                    $set: {
                        ...(currentTime >= user?.blockUntil ? { isBlocked: false, loginAttempts: 0 } : {})
                    }
                },
                { new: true }
            );

            if (!user) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_DOSE_NOT_EXISTS,
                        message: "Email does not exist"
                    }
                }).finish());
            }

            if (user.isBlocked && currentTime < user.blockUntil) {
                logger.error(`Account is locked until ${user.blockUntil}`);
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.ACCOUNT_LOCKED,
                        message: "Account locked. Try it after a while."
                    }
                }).finish());
            }

            if (!user.password) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.PASSWORD_NOT_SET,
                        message: "Password is not set for this account."
                    }
                }).finish());
            }

            const checkPass = bcrypt.compareSync(password, user.password);

            if (!checkPass) {
                const updateData = { $inc: { loginAttempts: 1 } };

                if (user.loginAttempts + 1 >= 5) {
                    updateData.$set = {
                        isBlocked: true,
                        blockUntil: new Date(currentTime.getTime() + 60 * 60 * 1000)
                    };
                    logger.error(`Account ${email} is locked due to multiple failed login attempts.`);
                }

                await User.updateOne({ email }, updateData);
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.LOGIN_ERROR,
                        message: "Account or password is incorrect."
                    }
                }).finish());
            }

            await User.updateOne({ email }, { $set: { loginAttempts: 0 } });

            const accessToken = jwt.sign({ id: user.id }, config.secret, { expiresIn: "7d" });

            logger.success(`User ${email} logged in successfully`);

            const text = formatUserData({}, accessToken);
            const response = SuccessResponse.encode({
                success: true,
                data: {
                    code: Constants.LOGIN_SUCCESS,
                    message: "Login successful.",
                    details: { data: encrypt.encryptData(text) }
                }
            }).finish()
            return res.status(200).send(response);
        } catch (error) {
            console.error("loginWithPass Error:", error);
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                code: Constants.SERVER_ERROR,
                message: "Internal Server Error"
            }).finish());
        }
    }

    async logout(req, res) {
        try {
            logger.warn("=========================================");
            logger.warn("Call logout");

            const { token } = req.decryptedData;

            if (!token) {
                return res.status(400).send(ErrorResponse.encode({
                    success: false,
                    error: { code: Constants.TOKEN_MISSING, message: "Token is required" }
                }).finish());
            }

            try {
                const decoded = jwt.verify(token, config.secret);
                const hashedToken = encrypt.encryptData(token);

                const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : null;

                logger.info(`expiresAt ${decoded.exp}`);
                logger.info(`decoded.exp * 1000 ${new Date(decoded.exp * 1000)}`);

                if (!expiresAt || isNaN(expiresAt.getTime())) {
                    logger.error(`Invalid token expiration date`);
                    return res.status(400).send(ErrorResponse.encode({
                        success: false,
                        error: { code: Constants.INVALID_EXPIRATION, message: "Invalid token expiration date" }
                    }).finish());
                }

                await RevokedToken.create({ token: hashedToken, expiresAt });

                logger.error(`User ${decoded.id} logged out`);

                return res.status(200).send(SuccessResponse.encode({
                    success: true,
                    data: { code: Constants.LOGOUT_SUCCESS, message: "Logout successful." }
                }).finish());

            } catch (err) {
                logger.error(err)
                return res.status(401).send(ErrorResponse.encode({
                    success: false,
                    error: { code: Constants.INVALID_TOKEN, message: "Invalid or expired token" }
                }).finish());
            }
        } catch (error) {
            console.error("Logout Error:", error);
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                error: { code: Constants.SERVER_ERROR, message: "Internal Server Error" }
            }).finish());
        }
    }


    async setPassWord(req, res) {
        try {
            logger.warn("=========================================");
            logger.warn("Call setPassWord");
            const { password } = req.decryptedData;
            const user = req.user
            if (!user.verified) {
                return res.status(403).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.OTP_NOT_VERIFIED,
                        message: "Please verify OTP before setting password"
                    }
                }).finish());
            }

            user.verified = true;
            user.password = bcrypt.hashSync(password, 10);
            await user.save();

            logger.success("Password set successfully");

            const response = SuccessResponse.encode({
                success: true,
                data: {
                    code: Constants.SETPASS_SUCCESS,
                    message: "Set password successful."
                }
            }).finish()
            console.error("response:", response);

            return res.status(200).send(response);
        } catch (error) {
            console.error("setPassWord Error:", error);
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                code: Constants.SERVER_ERROR,
                message: "Internal Server Error"
            }).finish());
        }
    }

    async verifyToken(req, res, next) {
        try {
            logger.warn("=========================================");
            logger.warn("Call verifyToken");

            let token = req.headers[Constants.X_ACCESS_TOKEN];
            const tokenDecrypt = encrypt.decryptData(token)
            if (!tokenDecrypt) {
                return res.status(403).json(formatResponseError("NOT_TOKEN", "No token provided!"));
            }

            const revokedToken = await RevokedToken.findOne({ token: encrypt.encryptData(tokenDecrypt) });
            if (revokedToken) {
                return res.status(401).send({ message: "Unauthorized! Token has been revoked." });
            }

            jwt.verify(tokenDecrypt, config.secret, (err, decoded) => {
                if (err) {
                    return res.status(401).json(formatResponseError("UNAUTHORIZED", "Unauthorized!"));
                }
                req.userId = decoded.id;
                next();
            });
        } catch (error) {
            logger.error("verifyToken " + error);
            return res.status(500).json(formatResponseError(Constants.SERVER_ERROR, "Internal Server Error!"));
        }
    }

    async isModerator(req, res) {
        try {
            logger.warn(req.userId)
            const user = await User.findById(req.userId);
            if (!user) {
                return res.status(409).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.EMAIL_DOSE_NOT_EXISTS,
                        message: "Email does not exist"
                    }
                }).finish());
            }
            if (user.verified) {
                const text = formatUserData(user);
                const response = SuccessResponse.encode({
                    success: true,
                    data: {
                        code: Constants.LOGIN_SUCCESS,
                        message: "Login successful.",
                        details: { data: encrypt.encryptData(text) }
                    }
                }).finish()
                return res.status(200).send(response);
            } else {

                return res.status(403).send(ErrorResponse.encode({
                    success: false,
                    error: {
                        code: Constants.OTP_NOT_VERIFIED,
                        message: "Please verify OTP before setting password"
                    }
                }).finish());
            }
        } catch (error) {
            console.error("isModerator Error:", error);
            return res.status(500).send(ErrorResponse.encode({
                success: false,
                code: Constants.SERVER_ERROR,
                message: "Internal Server Error"
            }).finish());
        }
    }

    async moderatorBoard(req, res) {
        const response = SuccessResponse.encode({
            success: true,
            data: {
                code: "CONTENT",
                message: "User Content."
            }
        }).finish()
        return res.status(200).send(response);
    }

    async updateUser(req, res) {
        try {
            upload.fields([
                { name: 'image', maxCount: 1 },
                { name: 'imageBanner', maxCount: 1 }
            ])(req, res, async (err) => {
                logger.info("IdUser " + req.userId)
                const user = await User.findById(req.userId);

                if (!user) {
                    return res.status(409).json(formatResponseError(Constants.EMAIL_DOSE_NOT_EXISTS, "Email does not exist!"));
                }

                if (req.files && req.files['image']) {
                    const oldImagePath = `./uploads/${user.image}`;
                    if (user.image) {
                        try {
                            await unlinkFile(oldImagePath);
                        } catch (error) {
                            logger.error('Error delete old image:', error);
                        }
                    }
                    user.image = req.files['image'][0].filename;
                }

                if (req.files && req.files['imageBanner']) {
                    const oldImageBannerPath = `./uploads/${user.imageBanner}`;
                    if (user.imageBanner) {
                        try {
                            await unlinkFile(oldImageBannerPath);
                        } catch (error) {
                            logger.error('Error delete old banner image:', error);
                        }
                    }
                    user.imageBanner = req.files['imageBanner'][0].filename;
                }

                const dataRequest = req.body.data

                if (dataRequest) {
                    let decryptedData;
                    try {
                        decryptedData = JSON.parse(encrypt.decryptData(dataRequest));
                    } catch (err) {
                        logger.error("DATA_NOT_DECRYPT " + err)
                        return res.status(400).json(formatResponseError(Constants.DATA_NOT_DECRYPT, "Invalid decrypted data format!"));
                    }

                    const { fullName, phone } = decryptedData;

                    if (fullName) {
                        user.fullName = fullName;
                    }
                    if (phone) {
                        user.phone = phone;
                    }
                }

                const updatedUser = await user.save();
                const data = {
                    fullName: updatedUser.fullName,
                    phone: updatedUser.phone,
                    image: req.files && req.files['image'] ? req.files['image'][0].filename : user.image,
                    imageBanner: req.files && req.files['imageBanner'] ? req.files['imageBanner'][0].filename : user.imageBanner,
                };

                const text = formatUserData(data);
                const textEncrpyt = encrypt.encryptData(text)

                return res.status(200).json(formatResponseSuccess(
                    Constants.UPDATE_SUCCESS,
                    "update data success",
                    textEncrpyt
                ));
            });
        } catch (error) {
            logger.error(error);
            return res.status(500).json(formatResponseError(Constants.SERVER_ERROR, "Internal Server Error!"));
        }
    }

    async getArtistAndAlbumAndSongByArtistId(req, res) {
        try {
            const idArtist = req.params.id;
            const dataArtist = await User.findById(idArtist)
            const albums = await album.find({ artistIdString: idArtist }).lean()
            const albumIds = albums.map(album => album._id);
            const songs = await song.find({ albumIdString: { $in: albumIds } }).lean();

            const songsByAlbum = {};
            songs.forEach(song => {
                if (!songsByAlbum[song.albumIdString]) {
                    songsByAlbum[song.albumIdString] = [];
                }
                songsByAlbum[song.albumIdString].push(song);
            });

            albums.forEach(album => {
                album.songs = songsByAlbum[album._id] || [];
            });

            res.status(200).json({ id: Date.now(), image: dataArtist.image, albums: albums, isAlbumArtist: true });

        } catch (error) {
            logger.error(error)
            return res.status(500).json(formatResponseError(null, false, 'Lỗi server'));
        }
    }

    async getAllArtist(req, res) {
        try {
            const users = await User.find({}, { _id: 1, image: 1, image: 1 });
        } catch (error) {
            logger.error(error)
            return res.status(500).json(formatResponseError(null, false, 'Lỗi server'));
        }
    }
}

const setUserData = async (email, data) => {
    await User.updateOne({ email }, { $set: data });
};

function isValidEmail(input) {
    if (!input) return false;
    const cleanEmail = input.trim();
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(cleanEmail);
}

const formatUserData = (user, accessToken) => {
    const filteredUser = {
        id: user._id,
        fullName: user.fullName,
        image: user.image,
        imageBanner: user.imageBanner,
        phone: user.phone,
        email: user.email,
        role: user.role,
        accessToken: accessToken
    };

    const cleanedUser = Object.fromEntries(
        Object.entries(filteredUser).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    return JSON.stringify(cleanedUser, null, 2);
};

export default new Auth();
