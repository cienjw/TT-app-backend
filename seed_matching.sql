-- 더미 2명
INSERT INTO users (nickname, profile_img) VALUES ('지호', 'avatar_1');
SET @u1 = LAST_INSERT_ID();
INSERT INTO users (nickname, profile_img) VALUES ('서연', 'avatar_2');
SET @u2 = LAST_INSERT_ID();

-- 관심사 (둘 다 폭넓게: 프로그래밍·게임·영화·운동/헬스·카페)
INSERT INTO user_interests (user_id, interest_id) VALUES
(@u1, 14), (@u1, 10), (@u1, 3), (@u1, 4), (@u1, 7),
(@u2, 14), (@u2, 10), (@u2, 3), (@u2, 4), (@u2, 7);

-- 대기열 등록 (threshold 낮게 → 아무나 잘 받아줌)
INSERT INTO matching_queue (user_id, threshold, status) VALUES
(@u1, 0.20, 'waiting'),
(@u2, 0.20, 'waiting');