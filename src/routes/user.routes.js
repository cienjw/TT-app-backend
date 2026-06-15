const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const user    = require('../controllers/user.controller');

router.get('/me',              auth, user.getMe);
router.delete('/me', auth, user.deleteAccount);
router.put('/me/interests',    auth, user.updateInterests);
router.put('/me/location',     auth, user.updateLocation);
router.get('/interests',       auth, user.getAllInterests);
router.put('/me', auth, user.updateProfile);
router.put('/me/survey', auth, user.saveSurvey);
router.post('/report',            auth, user.createReport);
router.post('/block',             auth, user.blockUser);
router.delete('/block/:targetId', auth, user.unblockUser);
router.get('/blocks',             auth, user.getBlockedUsers);

module.exports = router;