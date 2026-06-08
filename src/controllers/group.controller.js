const db = require('../config/db');

// 추천 매칭 리스트 (관심사 기반)
exports.getRecommendations = async (req, res) => {
  const userId = req.user.userId;

  // 내 관심사 가져오기
  const [myInterests] = await db.execute(
    'SELECT interest_id FROM user_interests WHERE user_id = ?',
    [userId]
  );
  
  if (myInterests.length === 0) {
    return res.json([]);
  }

  const interestIds = myInterests.map(i => i.interest_id);

  // 관심사가 겹치는 다른 유저들 추천 (간단한 매칭 알고리즘)
  const [recommendations] = await db.query(
    `SELECT u.id, u.nickname, u.profile_img, 
            COUNT(ui.interest_id) as shared_count,
            (COUNT(ui.interest_id) / ? * 100) as match_rate
     FROM users u
     JOIN user_interests ui ON u.id = ui.user_id
     WHERE ui.interest_id IN (?) AND u.id != ?
     GROUP BY u.id
     ORDER BY shared_count DESC
     LIMIT 10`,
    [interestIds.length, [interestIds], userId]
  );

  return res.json(recommendations);
};

// 내 채팅방 리스트
exports.getMyGroups = async (req, res) => {
  const userId = req.user.userId;
  const [groups] = await db.execute(
    `SELECT g.*, 
            (SELECT content FROM messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) as last_message,
            (SELECT created_at FROM messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
     FROM \`groups\` g
     JOIN group_members gm ON g.id = gm.group_id
     WHERE gm.user_id = ? AND g.status = 'active'
     ORDER BY last_message_at DESC`,
    [userId]
  );
  return res.json(groups);
};

// 채팅방 생성 (관심사 기반 자동 생성 또는 수동)
exports.createGroup = async (req, res) => {
  const { name, member_ids } = req.body;
  const userId = req.user.userId;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const [result] = await conn.execute(
      'INSERT INTO `groups` (name, expires_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [name || '새로운 채팅방']
    );
    const groupId = result.insertId;

    const allMembers = [...new Set([userId, ...(member_ids || [])])];
    const values = allMembers.map(id => [groupId, id]);
    await conn.query('INSERT INTO group_members (group_id, user_id) VALUES ?', [values]);

    await conn.commit();
    return res.json({ message: '채팅방이 생성되었습니다.', groupId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// 채팅 메시지 내역
exports.getMessages = async (req, res) => {
  const { groupId } = req.params;
  const [messages] = await db.execute(
    `SELECT m.*, u.nickname, u.profile_img 
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.group_id = ?
     ORDER BY m.created_at ASC`,
    [groupId]
  );
  return res.json(messages);
};

// 발자취 기록
exports.createFootprint = async (req, res) => {
  const { groupId, latitude, longitude } = req.body;
  const userId = req.user.userId;

  await db.execute(
    'INSERT INTO footprints (user_id, group_id, latitude, longitude) VALUES (?, ?, ?, ?)',
    [userId, groupId, latitude, longitude]
  );

  return res.json({ message: '발자취가 기록되었습니다.' });
};

// 내 발자취 리스트
exports.getMyFootprints = async (req, res) => {
  const userId = req.user.userId;
  const [footprints] = await db.execute(
    `SELECT f.*, g.name as group_name
     FROM footprints f
     JOIN \`groups\` g ON f.group_id = g.id
     WHERE f.user_id = ?
     ORDER BY f.met_at DESC`,
    [userId]
  );
  return res.json(footprints);
};
