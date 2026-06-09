const axios = require('axios');
const jwt   = require('jsonwebtoken');
const db    = require('../config/db');

// JWT 발급 헬퍼
function generateTokens(userId, nickname) {
  const accessToken = jwt.sign(
    { userId, nickname },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN }
  );
  return { accessToken, refreshToken };
}

// 신규 가입자에게 환영 그룹 1개 자동 생성
async function createWelcomeGroup(userId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [result] = await db.execute(
    'INSERT INTO `groups` (name, expires_at) VALUES (?, ?)',
    ['첫 모임에 오신 걸 환영해요', expiresAt]
  );
  await db.execute(
    'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
    [result.insertId, userId]
  );
}

// POST /api/auth/kakao
exports.kakaoLogin = async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) {
    return res.status(400).json({ message: 'access_token이 필요합니다.' });
  }

  try {
    // 1. 카카오 서버에서 유저 정보 조회
    const { data: kakaoUser } = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const kakaoId   = String(kakaoUser.id);
    const nickname  = kakaoUser.kakao_account?.profile?.nickname || '익명';
    const profileImg = kakaoUser.kakao_account?.profile?.profile_image_url;

    // 2. DB upsert (없으면 생성, 있으면 정보 업데이트)
    const [result] = await db.execute(
      `INSERT INTO users (kakao_id, nickname, profile_img)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), profile_img = VALUES(profile_img)`,
      [kakaoId, nickname, profileImg]
    );

    // insertId가 0이면 기존 유저 (ON DUPLICATE KEY 실행)
    let userId = result.insertId;
    if (userId === 0) {
      const [[user]] = await db.execute(
        'SELECT id FROM users WHERE kakao_id = ?', [kakaoId]
      );
      userId = user.id;
    }

    // 3. JWT 발급
    const tokens = generateTokens(userId, nickname);

    // 4. 신규 유저 여부 반환 (Flutter에서 관심사 입력 화면으로 보낼지 판단)
    const isNewUser = result.insertId !== 0;

    // 신규 가입자면 환영 그룹 자동 생성
    if (isNewUser) {
      await createWelcomeGroup(userId);
    }

    return res.json({ ...tokens, isNewUser, userId });
  } catch (err) {
    console.error('Kakao login error:', err.message);
    return res.status(500).json({ message: '카카오 로그인 처리 중 오류가 발생했습니다.' });
  }
};

// POST /api/auth/google
exports.googleLogin = async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) {
    return res.status(400).json({ message: 'id_token이 필요합니다.' });
  }

  try {
    // Google ID 토큰 검증
    const { data: googleUser } = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`
    );

    if (googleUser.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ message: '유효하지 않은 Google 토큰입니다.' });
    }

    const googleId  = googleUser.sub;
    const nickname  = googleUser.name || '익명';
    const profileImg = googleUser.picture;

    const [result] = await db.execute(
      `INSERT INTO users (google_id, nickname, profile_img)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), profile_img = VALUES(profile_img)`,
      [googleId, nickname, profileImg]
    );

    let userId = result.insertId;
    if (userId === 0) {
      const [[user]] = await db.execute(
        'SELECT id FROM users WHERE google_id = ?', [googleId]
      );
      userId = user.id;
    }

    const tokens = generateTokens(userId, nickname);
    const isNewUser = result.insertId !== 0;

    if (isNewUser) {
      await createWelcomeGroup(userId);
    }
    
    return res.json({ ...tokens, isNewUser, userId });
  } catch (err) {
    console.error('Google login error:', err.message);
    return res.status(500).json({ message: '구글 로그인 처리 중 오류가 발생했습니다.' });
  }
};

// POST /api/auth/refresh
exports.refreshToken = async (req, res) => {
  const { refresh_token } = req.body;
  try {
    const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET);
    const [[user]] = await db.execute(
      'SELECT id, nickname FROM users WHERE id = ?', [decoded.userId]
    );
    if (!user) return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });

    const tokens = generateTokens(user.id, user.nickname);
    return res.json(tokens);
  } catch (err) {
    return res.status(401).json({ message: '리프레시 토큰이 만료되었습니다.' });
  }
};

// 개발용 테스트 로그인 (NODE_ENV=development 일 때만 작동)
exports.devLogin = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ message: 'Not found' });
  }
  const { nickname = '테스트유저' } = req.body;

  // 매번 고유한 테스트 유저 생성 (여러 명 매칭 시뮬레이션용)
  const uniqueId = `dev_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const [result] = await db.execute(
    'INSERT INTO users (kakao_id, nickname) VALUES (?, ?)',
    [uniqueId, nickname]
  );
  const userId = result.insertId;

  // 신규 가입자 환영 그룹
  await createWelcomeGroup(userId);

  return res.json({ ...generateTokens(userId, nickname), userId });
};