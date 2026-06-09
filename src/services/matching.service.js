const db = require('../config/db');

// 관심사 집합 유사도 (Jaccard)
function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// 매칭 실행: 대기 중인 유저들을 모아 그룹 생성
// 반환: 생성되거나 합류된 group_id
exports.runMatchingForUser = async (userId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // 유저 존재 확인 (탈퇴/삭제된 유저 방어)
    const [[userExists]] = await conn.execute(
      'SELECT 1 FROM users WHERE id = ?', [userId]
    );
    if (!userExists) {
      await conn.rollback();
      const err = new Error('USER_NOT_FOUND');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    // 1. 이미 active 그룹에 속해 있고 정원(5) 미만인 방이 있는지 확인
    //    → 발표 단순화: 정원 안 찬 active 그룹에 합류시킴
    const [openGroups] = await conn.query(
      `SELECT g.id,
              g.max_members AS maxMembers,
              COUNT(gm.user_id) AS cnt
       FROM \`groups\` g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE g.status = 'active'
         AND g.id NOT IN (
           SELECT group_id FROM group_members WHERE user_id = ?
         )
       GROUP BY g.id, g.max_members
       HAVING cnt < maxMembers
       ORDER BY cnt DESC
       LIMIT 1`,
      [userId]
    );

    let groupId;

    if (openGroups.length > 0) {
      // 기존 방에 합류
      groupId = openGroups[0].id;
      await conn.execute(
        'INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, userId]
      );
    } else {
      // 새 방 생성 (7일 후 만료)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [result] = await conn.execute(
        'INSERT INTO `groups` (name, expires_at) VALUES (?, ?)',
        ['새로운 모임', expiresAt]
      );
      groupId = result.insertId;
      await conn.execute(
        'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, userId]
      );
    }

    await conn.commit();
    return groupId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};