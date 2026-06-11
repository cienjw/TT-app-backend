const express   = require('express');
const router    = express.Router();
const auth      = require('../middlewares/auth.middleware');
const footprint = require('../controllers/footprint.controller');

router.get('/',  auth, footprint.getFootprints);
router.post('/', auth, footprint.createFootprint);

module.exports = router;