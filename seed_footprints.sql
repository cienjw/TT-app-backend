-- 1) 더미 유저 6명
INSERT INTO users (kakao_id, nickname, profile_img) VALUES
('seed_u1','민지','avatar_1'),('seed_u2','서연','avatar_2'),
('seed_u3','도윤','avatar_3'),('seed_u4','하준','avatar_1'),
('seed_u5','지호','avatar_2'),('seed_u6','수아','avatar_3');

-- 2) 더미 그룹 5개 (지역별)
INSERT INTO `groups` (name, expires_at) VALUES
('강남 카페투어',   DATE_ADD(NOW(), INTERVAL 7 DAY)),
('홍대 보드게임',   DATE_ADD(NOW(), INTERVAL 7 DAY)),
('평택대 스터디',   DATE_ADD(NOW(), INTERVAL 7 DAY)),
('안성 등산모임',   DATE_ADD(NOW(), INTERVAL 7 DAY)),
('평택 러닝크루',   DATE_ADD(NOW(), INTERVAL 7 DAY));

-- 3) 더미 유저 관심사 (발자취 상세 태그용)
INSERT INTO user_interests (user_id, interest_id)
SELECT u.id, i.id FROM users u JOIN interests i ON (
  (u.kakao_id='seed_u1' AND i.name IN ('카페 탐방','맛집 탐방','사진')) OR
  (u.kakao_id='seed_u2' AND i.name IN ('게임','음악 감상','영화/드라마')) OR
  (u.kakao_id='seed_u3' AND i.name IN ('운동/헬스','등산','사이클')) OR
  (u.kakao_id='seed_u4' AND i.name IN ('독서','여행','카페 탐방')) OR
  (u.kakao_id='seed_u5' AND i.name IN ('프로그래밍','게임','음악 감상')) OR
  (u.kakao_id='seed_u6' AND i.name IN ('요리','맛집 탐방','여행'))
);

-- 4) 그룹 멤버 (그룹당 3명씩)
INSERT INTO group_members (group_id, user_id)
SELECT g.id, u.id FROM `groups` g JOIN users u ON (
  (g.name='강남 카페투어' AND u.kakao_id IN ('seed_u1','seed_u4','seed_u6')) OR
  (g.name='홍대 보드게임' AND u.kakao_id IN ('seed_u2','seed_u5','seed_u3')) OR
  (g.name='평택대 스터디' AND u.kakao_id IN ('seed_u5','seed_u1','seed_u3')) OR
  (g.name='안성 등산모임' AND u.kakao_id IN ('seed_u3','seed_u4','seed_u6')) OR
  (g.name='평택 러닝크루' AND u.kakao_id IN ('seed_u4','seed_u2','seed_u1'))
);

-- 5) 발자취 (그룹별 좌표 — 멤버 수만큼 attendee_count 잡힘)
INSERT INTO footprints (user_id, group_id, latitude, longitude, met_at)
SELECT gm.user_id, gm.group_id,
  CASE g.name
    WHEN '강남 카페투어' THEN 37.49790000
    WHEN '홍대 보드게임' THEN 37.55630000
    WHEN '평택대 스터디' THEN 36.99210000
    WHEN '안성 등산모임' THEN 37.00700000
    WHEN '평택 러닝크루' THEN 36.99500000
  END,
  CASE g.name
    WHEN '강남 카페투어' THEN 127.02760000
    WHEN '홍대 보드게임' THEN 126.92360000
    WHEN '평택대 스터디' THEN 127.11290000
    WHEN '안성 등산모임' THEN 127.27870000
    WHEN '평택 러닝크루' THEN 127.10500000
  END,
  DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*7) DAY)
FROM group_members gm JOIN `groups` g ON gm.group_id = g.id
WHERE g.name IN ('강남 카페투어','홍대 보드게임','평택대 스터디','안성 등산모임','평택 러닝크루');