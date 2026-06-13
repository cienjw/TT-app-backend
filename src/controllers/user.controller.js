const db = require('../config/db');

exports.getMe = async (req, res) => {
  const [[user]] = await db.execute(
    `SELECT u.id, u.nickname, u.profile_img, u.bio,
            JSON_ARRAYAGG(
              JSON_OBJECT('id', i.id, 'name', i.name, 'category', i.category)
            ) AS interests
     FROM users u
     LEFT JOIN user_interests ui ON u.id = ui.user_id
     LEFT JOIN interests i ON ui.interest_id = i.id
     WHERE u.id = ?
     GROUP BY u.id`,
    [req.user.userId]
  );
  return res.json(user);
};

exports.getAllInterests = async (req, res) => {
  const [interests] = await db.execute(
    'SELECT id, name, category FROM interests ORDER BY category, name'
  );
  return res.json(interests);
};

exports.updateInterests = async (req, res) => {
  const { interest_ids } = req.body;
  const userId = req.user.userId;

  if (!Array.isArray(interest_ids) || interest_ids.length < 3) {
    return res.status(400).json({ message: '관심사를 3개 이상 선택해주세요.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM user_interests WHERE user_id = ?', [userId]);
    const values = interest_ids.map(id => [userId, id]);
    await conn.query('INSERT INTO user_interests (user_id, interest_id) VALUES ?', [values]);
    await conn.commit();
    return res.json({ message: '관심사가 업데이트되었습니다.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateLocation = async (req, res) => {
  const { latitude, longitude } = req.body;
  await db.execute(
    `INSERT INTO user_locations (user_id, latitude, longitude)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude)`,
    [req.user.userId, latitude, longitude]
  );
  return res.json({ message: 'ok' });
};

exports.updateProfile = async (req, res) => {
  const { nickname, profile_img } = req.body;
  const userId = req.user.userId;

  if (!nickname?.trim()) {
    return res.status(400).json({ message: '닉네임을 입력해주세요.' });
  }

  await db.execute(
    'UPDATE users SET nickname = ?, profile_img = ? WHERE id = ?',
    [nickname.trim(), profile_img ?? null, userId]
  );

  return res.json({ message: 'ok' });
};

const FIELD_TO_INTERESTS = {
  tech:    ['프로그래밍', '게임'],
  content: ['영화/드라마', '독서', '음악 감상'],
  art:     ['그림/일러스트', '사진'],
  social:  ['카페 탐방', '맛집 탐방', '여행'],
  sport:   ['운동/헬스', '등산', '사이클'],
  making:  ['요리', '그림/일러스트', '프로그래밍'],
};

exports.saveSurvey = async (req, res) => {
  const { fields, depth, virtuality, collab, purpose, mbti } = req.body;
  const userId = req.user.userId;

  // 분야 → 관심사 태그 이름 집합
  const names = new Set();
  for (const f of (fields || [])) {
    (FIELD_TO_INTERESTS[f] || []).forEach((n) => names.add(n));
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 성향 + MBTI 저장
    await conn.execute(
      `UPDATE users
         SET survey_depth = ?, survey_virtuality = ?,
             survey_collab = ?, survey_purpose = ?, mbti = ?
       WHERE id = ?`,
      [depth ?? null, virtuality ?? null,
       collab ?? null, purpose ?? null, mbti ?? null, userId]
    );

    // 분야 → 관심사 태그로 user_interests 갱신
    if (names.size > 0) {
      const [rows] = await conn.query(
        'SELECT id FROM interests WHERE name IN (?)',
        [[...names]]
      );
      const ids = rows.map((r) => r.id);
      await conn.execute('DELETE FROM user_interests WHERE user_id = ?', [userId]);
      if (ids.length > 0) {
        const values = ids.map((id) => [userId, id]);
        await conn.query(
          'INSERT INTO user_interests (user_id, interest_id) VALUES ?',
          [values]
        );
      }
    }

    await conn.commit();
    return res.json({ message: '설문 결과가 저장되었습니다.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};