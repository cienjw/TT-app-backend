const db = require('../config/db');

// GET /api/footprints — 만남 기록을 그룹 단위로 묶어서 반환
exports.getFootprints = async (req, res) => {
  // 1. 그룹별 발자취 집계 (대표 위치 = 좌표 평균)
  const [spots] = await db.execute(
    `SELECT f.group_id,
            g.name AS group_name,
            AVG(f.latitude)  AS latitude,
            AVG(f.longitude) AS longitude,
            MAX(f.met_at)    AS met_at,
            COUNT(DISTINCT f.user_id) AS attendee_count
     FROM footprints f
     JOIN \`groups\` g ON f.group_id = g.id
     GROUP BY f.group_id, g.name
     ORDER BY met_at DESC`
  );

  if (spots.length === 0) return res.json([]);

  // 2. 해당 그룹들의 관심사 빈도 집계 (멤버들의 관심사)
  const groupIds = spots.map(s => s.group_id);
  const placeholders = groupIds.map(() => '?').join(',');
  const [interestRows] = await db.execute(
    `SELECT gm.group_id, i.name, COUNT(*) AS cnt
     FROM group_members gm
     JOIN user_interests ui ON gm.user_id = ui.user_id
     JOIN interests i ON ui.interest_id = i.id
     WHERE gm.group_id IN (${placeholders})
     GROUP BY gm.group_id, i.name
     ORDER BY cnt DESC`,
    groupIds
  );

  // 3. group_id → 상위 3개 관심사 이름 매핑
  const interestMap = {};
  for (const row of interestRows) {
    (interestMap[row.group_id] ??= []);
    if (interestMap[row.group_id].length < 3) {
      interestMap[row.group_id].push(row.name);
    }
  }

  // 4. 합치기 (DECIMAL 평균은 문자열로 오므로 Number로 변환)
  const result = spots.map(s => ({
    group_id: s.group_id,
    group_name: s.group_name,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    met_at: s.met_at,
    attendee_count: s.attendee_count,
    interests: interestMap[s.group_id] || [],
  }));

  return res.json(result);
};

// POST /api/footprints — 만남 인증 (다음 턴 "만났어요" 버튼용)
exports.createFootprint = async (req, res) => {
  const { group_id, latitude, longitude } = req.body;
  const userId = req.user.userId;

  if (!group_id || latitude == null || longitude == null) {
    return res.status(400).json({ message: 'group_id, latitude, longitude가 필요합니다.' });
  }

  const [[member]] = await db.execute(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    [group_id, userId]
  );
  if (!member) return res.status(403).json({ message: '그룹 멤버가 아닙니다.' });

  // 같은 유저+그룹이면 갱신, 아니면 새로 기록
  const [[existing]] = await db.execute(
    'SELECT id FROM footprints WHERE user_id = ? AND group_id = ?',
    [userId, group_id]
  );
  if (existing) {
    await db.execute(
      'UPDATE footprints SET latitude = ?, longitude = ?, met_at = NOW() WHERE id = ?',
      [latitude, longitude, existing.id]
    );
  } else {
    await db.execute(
      'INSERT INTO footprints (user_id, group_id, latitude, longitude) VALUES (?, ?, ?, ?)',
      [userId, group_id, latitude, longitude]
    );
  }

  return res.json({ message: '만남이 기록되었어요!' });
};