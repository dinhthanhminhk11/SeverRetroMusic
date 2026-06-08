import { Router } from 'express';
import User from '../controller/auth';
import platformCheck from '../middlewares/platformCheck';
import decodeProtobuf from "../middlewares/decodeProtobuf";
import validateEmail from "../middlewares/validateEmail";
import checkEmailExists from "../middlewares/checkEmailExists";
import checkEmailNotExists from "../middlewares/checkEmailNotExists";
const router = Router();

router.post('/auth/register', platformCheck(['android']), decodeProtobuf, validateEmail, checkEmailExists, User.register);
router.post('/auth/verifyOTP', platformCheck(['android']), decodeProtobuf, validateEmail, User.verifyOTP);
router.post('/auth/setPassword', platformCheck(['android']), decodeProtobuf, validateEmail, checkEmailNotExists, User.setPassWord);
router.post('/auth/login', platformCheck(['android']), decodeProtobuf, validateEmail, User.loginWithPass);
router.post('/auth/checkAccount', platformCheck(['android']), decodeProtobuf, validateEmail, User.loginWithOtp);
router.post('/auth/resentOtp', platformCheck(['android']), User.gennerateOTP);
router.post('/auth/logout', platformCheck(['android']), decodeProtobuf, User.logout);
router.get('/auth/test/otp', User.getOtpForTest);
router.delete('/auth/test/user', User.deleteUserForTest);
// router.get('/auth/testLogin', platformCheck(['web']),  User.testLogin);
router.get('/auth/testLogin', User.testLogin);
router.patch('/auth/updateUser', platformCheck(['android']), User.verifyToken, User.updateUser);

router.get('/auth/getUserByToken', platformCheck(['android']), User.verifyToken, User.isModerator, User.moderatorBoard);

export default router;
