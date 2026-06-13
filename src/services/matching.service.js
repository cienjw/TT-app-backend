const db = require('../config/db');

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// 대기열 등록 (이미 있으면 threshold 갱신하고 다시 waiting)
exports.enqueue = async (userId, threshold = 0.85) => {
  await db.execute(
    `INSERT INTO matching_queue (user_id, threshold, status)
     VALUES (?, ?, 'waiting')
     ON DUPLICATE KEY UPDATE
       threshold = VALUES(threshold), status = 'waiting', joined_at = CURRENT_TIMESTAMP`,
    [userId, threshold]
  );
};

// 대기열 취소
exports.dequeue = async (userId) => {
  await db.execute('DELETE FROM matching_queue WHERE user_id = ?', [userId]);
};

// 현재 상태: 'waiting' | 'idle'
exports.getStatus = async (userId) => {
  const [[row]] = await db.execute(
    'SELECT status FROM matching_queue WHERE user_id = ?',
    [userId]
  );
  return row ? row.status : 'idle';
};

async function loadInterests(conn, userId) {
  const [rows] = await conn.execute(
    'SELECT interest_id FROM user_interests WHERE user_id = ?',
    [userId]
  );
  return rows.map((r) => r.interest_id);
}

// 워커: 큐를 훑어 조건 맞는 사람을 3~5명 묶어 방 생성
exports.runMatchingCycle = async () => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [waiters] = await conn.query(
      "SELECT user_id, threshold FROM matching_queue WHERE status = 'waiting' ORDER BY joined_at ASC"
    );
    if (waiters.length < 3) {
      await conn.commit();
      return;
    }

    // 대기자 관심사 미리 로드
    const interests = {};
    for (const w of waiters) {
      interests[w.user_id] = await loadInterests(conn, w.user_id);
    }

    const used = new Set();
    for (const seed of waiters) {
      if (used.has(seed.user_id)) continue;
      const group = [seed.user_id];

      for (const cand of waiters) {
        if (cand.user_id === seed.user_id || used.has(cand.user_id)) continue;
        if (group.length >= 5) break;
        const sim = jaccard(interests[seed.user_id], interests[cand.user_id]);
        // 양방향: 둘 중 더 까다로운 기준을 만족해야 함
        const need = Math.max(Number(seed.threshold), Number(cand.threshold));
        if (sim >= need) group.push(cand.user_id);
      }

      if (group.length >= 3) {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [r] = await conn.execute(
          "INSERT INTO `groups` (name, expires_at) VALUES (?, ?)",
          ['새로운 모임', expiresAt]
        );
        const gid = r.insertId;
        await conn.query(
          'INSERT INTO group_members (group_id, user_id) VALUES ?',
          [group.map((uid) => [gid, uid])]
        );
        await conn.query('DELETE FROM matching_queue WHERE user_id IN (?)', [group]);
        group.forEach((uid) => used.add(uid));
        console.log(`### 매칭 성사: group ${gid}, members [${group.join(', ')}]`);
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('### 매칭 사이클 오류:', err.message);
  } finally {
    conn.release();
  }
};