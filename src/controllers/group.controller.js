const db = require('../config/db');
const matchingService = require('../services/matching.service');

// POST /api/matching/join — 매칭 참가
exports.joinMatching = async (req, res) => {
  try {
    const groupId = await matchingService.runMatchingForUser(req.user.userId);
    return res.json({ message: '매칭 완료', groupId });
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND') {
      return res.status(401).json({ message: '다시 로그인해주세요.' });
    }
    console.error('Matching error:', err.message);
    return res.status(500).json({ message: '매칭 중 오류가 발생했습니다.' });
  }
};

// GET /api/groups — 내 그룹 목록
exports.getMyGroups = async (req, res) => {
  const [groups] = await db.execute(
    `SELECT g.id, g.name, g.status, g.expires_at, g.created_at,
            COUNT(gm2.user_id) AS member_count,
            (SELECT content FROM messages m
             WHERE m.group_id = g.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_message
     FROM \`groups\` g
     JOIN group_members gm ON g.id = gm.group_id
     JOIN group_members gm2 ON g.id = gm2.group_id
     WHERE gm.user_id = ?
     GROUP BY g.id
     ORDER BY g.created_at DESC`,
    [req.user.userId]
  );
  return res.json(groups);
};

// GET /api/groups/:id — 그룹 상세 (멤버 목록 포함)
exports.getGroupDetail = async (req, res) => {
  const groupId = req.params.id;

  // 멤버 여부 확인
  const [[member]] = await db.execute(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, req.user.userId]
  );
  if (!member) {
    return res.status(403).json({ message: '그룹 멤버가 아닙니다.' });
  }

  const [[group]] = await db.execute(
    'SELECT id, name, status, max_members, expires_at FROM `groups` WHERE id = ?',
    [groupId]
  );

  const [members] = await db.execute(
    `SELECT u.id, u.nickname, u.profile_img
     FROM group_members gm JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ?`,
    [groupId]
  );

  return res.json({ ...group, members });
};

// GET /api/groups/:id/messages — 채팅방 메시지 기록 (페이지네이션)
exports.getMessages = async (req, res) => {
  const groupId = req.params.id;

  const [[member]] = await db.execute(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, req.user.userId]
  );
  if (!member) {
    return res.status(403).json({ message: '그룹 멤버가 아닙니다.' });
  }

  const [messages] = await db.execute(
    `SELECT m.id, m.content, m.sender_id, m.created_at,
            u.nickname AS sender_nickname, u.profile_img AS sender_profile_img
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.group_id = ?
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [groupId]
  );

  if (messages.length === 0) return res.json([]);

  // 반응 집계 (실패해도 메시지는 그대로 반환)
  const reactionMap = {};
  try {
    const msgIds = messages.map((m) => m.id);
    const placeholders = msgIds.map(() => '?').join(',');
    const [reactionRows] = await db.query(   // ← execute가 아니라 query
      `SELECT message_id, reaction, COUNT(*) AS count,
              JSON_ARRAYAGG(user_id) AS user_ids
       FROM message_reactions
       WHERE message_id IN (${placeholders})
       GROUP BY message_id, reaction`,
      msgIds
    );
    for (const r of reactionRows) {
      (reactionMap[r.message_id] ??= []).push({
        reaction: r.reaction,
        count: Number(r.count),
        userIds: typeof r.user_ids === 'string'
            ? JSON.parse(r.user_ids)
            : r.user_ids,
      });
    }
  } catch (e) {
    console.error('### reaction 집계 실패:', e.message);
  }

  const result = messages.map((m) => ({
    ...m,
    reactions: reactionMap[m.id] || [],
  }));

  return res.json(result.reverse());
};