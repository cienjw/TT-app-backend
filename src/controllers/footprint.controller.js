const db = require('../config/db');

function distM(a, b) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

exports.getFootprints = async (req, res) => {
  const userId = req.user.userId;
  const RADIUS_M = 500;     // 이 반경 안에 모여야 "같이 만난" 걸로 침
  const MIN_ATTENDEES = 1;  // 2로 바꾸면 혼자 인증은 만남으로 안 띄움

  // 내 관심사와 겹치는 그룹의 모든 인증 raw
  const [rows] = await db.execute(
    `SELECT f.group_id, g.name AS group_name, f.user_id,
            f.latitude + 0 AS latitude, f.longitude + 0 AS longitude,
            f.met_at, DATE(f.met_at) AS met_date
     FROM footprints f
     JOIN \`groups\` g ON f.group_id = g.id
     WHERE f.group_id IN (
       SELECT DISTINCT gm.group_id FROM group_members gm
       JOIN user_interests ui ON gm.user_id = ui.user_id
       WHERE ui.interest_id IN (SELECT interest_id FROM user_interests WHERE user_id = ?)
     )
     ORDER BY f.met_at ASC`,
    [userId]
  );
  if (rows.length === 0) return res.json([]);

  // 1) 그룹+날짜로 세션 묶기
  const sessions = {};
  for (const r of rows) {
    r.latitude = Number(r.latitude);
    r.longitude = Number(r.longitude);
    (sessions[`${r.group_id}_${r.met_date}`] ??= []).push(r);
  }

  // 2) 각 세션에서 "첫 인증 기준 RADIUS_M 안"에 모인 사람만 한 만남으로
  const spots = [];
  for (const key in sessions) {
    const pts = sessions[key];
    const anchor = pts[0];
    const near = pts.filter(p => distM(anchor, p) <= RADIUS_M);
    const userIds = [...new Set(near.map(p => p.user_id))];
    if (userIds.length < MIN_ATTENDEES) continue;  // 근처에 충분히 안 모이면 만남 아님
    spots.push({
      group_id: anchor.group_id,
      group_name: anchor.group_name,
      latitude: near.reduce((s, p) => s + p.latitude, 0) / near.length,
      longitude: near.reduce((s, p) => s + p.longitude, 0) / near.length,
      met_at: near[near.length - 1].met_at,
      attendee_count: userIds.length,   // ← "N명이 만났어요"
    });
  }
  spots.sort((a, b) => new Date(b.met_at) - new Date(a.met_at));
  if (spots.length === 0) return res.json([]);

  // 3) 관심사 태그 (그룹별 상위 3개)
  const groupIds = [...new Set(spots.map(s => s.group_id))];
  const ph = groupIds.map(() => '?').join(',');
  const [interestRows] = await db.execute(
    `SELECT gm.group_id, i.name, COUNT(*) AS cnt
     FROM group_members gm
     JOIN user_interests ui ON gm.user_id = ui.user_id
     JOIN interests i ON ui.interest_id = i.id
     WHERE gm.group_id IN (${ph})
     GROUP BY gm.group_id, i.name ORDER BY cnt DESC`,
    groupIds
  );
  const interestMap = {};
  for (const r of interestRows) {
    (interestMap[r.group_id] ??= []);
    if (interestMap[r.group_id].length < 3) interestMap[r.group_id].push(r.name);
  }

  return res.json(spots.map(s => ({ ...s, interests: interestMap[s.group_id] || [] })));
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

  await db.execute(
    'INSERT INTO footprints (user_id, group_id, latitude, longitude) VALUES (?, ?, ?, ?)',
    [userId, group_id, latitude, longitude]
  );

  return res.json({ message: '만남이 기록되었어요!' });
};