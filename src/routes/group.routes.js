const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const group   = require('../controllers/group.controller');

router.get('/recommendations', auth, group.getRecommendations);
router.get('/my',              auth, group.getMyGroups);
router.post('/',               auth, group.createGroup);
router.get('/:groupId/messages', auth, group.getMessages);
router.post('/footprints',     auth, group.createFootprint);
router.get('/footprints/my',   auth, group.getMyFootprints);

module.exports = router;
