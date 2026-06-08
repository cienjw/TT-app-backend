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
  const { nickname, profile_img, bio } = req.body;
  const userId = req.user.userId;

  await db.execute(
    `UPDATE users SET nickname = ?, profile_img = ?, bio = ? WHERE id = ?`,
    [nickname, profile_img, bio, userId]
  );

  return res.json({ message: '프로필이 업데이트되었습니다.' });
};