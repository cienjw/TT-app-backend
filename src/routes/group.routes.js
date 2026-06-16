const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const group   = require('../controllers/group.controller');

router.get('/',     auth, group.getMyGroups);
router.get('/:id/messages', auth, group.getMessages);
router.get('/:id',  auth, group.getGroupDetail);
router.put('/:id',         auth, group.updateGroupName);
router.delete('/:id/leave', auth, group.leaveGroup);
router.get('/:id/icebreakers', auth, group.getIcebreakers);
router.post('/:id/coach',      auth, group.getCoachTip);

module.exports = router;