const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const group   = require('../controllers/group.controller');

router.post('/join',   auth, group.joinMatching);
router.delete('/',     auth, group.cancelMatching);
router.get('/status',  auth, group.getMatchingStatus);

module.exports = router;