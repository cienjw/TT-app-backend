CREATE DATABASE IF NOT EXISTS app_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE app_db;
SET NAMES utf8mb4;

-- 유저
CREATE TABLE users (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kakao_id          VARCHAR(100)    UNIQUE,
    google_id         VARCHAR(100)    UNIQUE,
    nickname          VARCHAR(30)     NOT NULL,
    profile_img       VARCHAR(500),
    bio               VARCHAR(200),
    is_active         TINYINT(1)      DEFAULT 1,
    survey_depth      DECIMAL(3,2)    NULL,
    survey_virtuality DECIMAL(3,2)    NULL,
    survey_collab     VARCHAR(10)     NULL,
    survey_purpose    VARCHAR(10)     NULL,
    mbti              VARCHAR(4)      NULL,
    created_at        DATETIME        DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    onboarded         TINYINT NOT NULL DEFAULT 0,
);

-- 관심사 마스터 테이블 (운동, 음악, 독서 등)
CREATE TABLE interests (
    id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name     VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50)  -- 예: 취미, 음식, 스포츠
);

-- 대기열 테이블
CREATE TABLE matching_queue (
    user_id     BIGINT UNSIGNED           PRIMARY KEY,
    threshold   DECIMAL(3,2)     NOT NULL DEFAULT 0.85,
    status      ENUM('waiting','matched') DEFAULT 'waiting',
    joined_at   DATETIME                  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 유저-관심사 (N:M)
CREATE TABLE user_interests (
    user_id     BIGINT UNSIGNED NOT NULL,
    interest_id INT UNSIGNED    NOT NULL,
    PRIMARY KEY (user_id, interest_id),
    FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
    FOREIGN KEY (interest_id) REFERENCES interests(id) ON DELETE CASCADE
);

-- 유저 위치 (매칭용, 최신 위치만 upsert)
CREATE TABLE user_locations (
    user_id    BIGINT UNSIGNED PRIMARY KEY,
    latitude   DECIMAL(10, 8) NOT NULL,
    longitude  DECIMAL(11, 8) NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 그룹 (채팅방)
CREATE TABLE `groups` (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100),
    status      ENUM('active', 'expired', 'met') DEFAULT 'active',
    max_members TINYINT DEFAULT 5,
    expires_at  DATETIME,  -- 생성 후 7일 뒤 자동 만료
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 그룹 멤버 (N:M)
CREATE TABLE group_members (
    group_id  BIGINT UNSIGNED NOT NULL,
    user_id   BIGINT UNSIGNED NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
);

-- 채팅 메시지
CREATE TABLE messages (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    group_id    BIGINT UNSIGNED NOT NULL,
    sender_id   BIGINT UNSIGNED NOT NULL,
    content     TEXT NOT NULL,
    reply_to_id BIGINT UNSIGNED NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id)    REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id)   REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_reply_to FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
    INDEX idx_group_created (group_id, created_at)
);

CREATE TABLE blocks (
    blocker_id  BIGINT UNSIGNED NOT NULL,
    blocked_id  BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME        DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id)    REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id)    REFERENCES users(id) ON DELETE CASCADE
);

-- 발자취 (오프라인 만남 확인 시 기록)
CREATE TABLE footprints (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    group_id   BIGINT UNSIGNED NOT NULL,
    latitude   DECIMAL(10, 8),
    longitude  DECIMAL(11, 8),
    met_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE
);

-- 반응
CREATE TABLE message_reactions (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id  BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    reaction    VARCHAR(20) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    UNIQUE KEY  uq_reaction  (message_id, user_id, reaction)
);

-- 신고
CREATE TABLE reports (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reporter_id BIGINT UNSIGNED NOT NULL,
    target_id   BIGINT UNSIGNED NOT NULL,
    reason      VARCHAR(200),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (target_id)   REFERENCES users(id)
);

-- 관심사 초기 데이터
INSERT INTO interests (name, category) VALUES
('음악 감상', '취미'), ('독서', '취미'), ('영화/드라마', '취미'),
('운동/헬스', '스포츠'), ('등산', '스포츠'), ('사이클', '스포츠'),
('카페 탐방', '라이프'), ('맛집 탐방', '라이프'), ('여행', '라이프'),
('게임', '취미'), ('그림/일러스트', '예술'), ('사진', '예술'),
('요리', '취미'), ('프로그래밍', '기술'), ('언어 교환', '학습');