const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const user    = require('../controllers/user.controller');

router.get('/me',              auth, user.getMe);
router.put('/me/interests',    auth, user.updateInterests);
router.put('/me/location',     auth, user.updateLocation);
router.get('/interests',       auth, user.getAllInterests);
router.put('/me', auth, user.updateProfile);

module.exports = router;