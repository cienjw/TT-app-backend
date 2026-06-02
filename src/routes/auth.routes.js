const express = require('express');
const router  = express.Router();
const auth    = require('../controllers/auth.controller');

router.post('/kakao',   auth.kakaoLogin);
router.post('/google',  auth.googleLogin);
router.post('/refresh', auth.refreshToken);

module.exports = router;