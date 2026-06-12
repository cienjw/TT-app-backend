const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('../config/db');

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: '*' },  // 개발용. 배포 시 도메인 제한
  });

  // 1. 소켓 인증 미들웨어 — 연결 시 JWT 검증
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('인증 토큰이 없습니다.'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.nickname = decoded.nickname;
      const [[user]] = await db.execute(
      'SELECT profile_img FROM users WHERE id = ?', [decoded.userId]
    );
    socket.profileImg = user?.profile_img ?? null;
    next();
  } catch (err) {
    next(new Error('유효하지 않은 토큰입니다.'));
  }
});

  // 2. 연결 이벤트
  io.on('connection', (socket) => {
    console.log(`Socket connected: user ${socket.userId}`);

    // 채팅방 입장 (room join)
    socket.on('join_room', async (groupId) => {
      // 멤버 검증
      try {
        const [[member]] = await db.execute(
          'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, socket.userId]
        );
        if (!member) {
          socket.emit('error_message', '입장 권한이 없는 방입니다.');
          return;
        }
        socket.join(`group_${groupId}`);
        console.log(`user ${socket.userId} joined group_${groupId}`);
      } catch (err) {
        socket.emit('error_message', '입장 중 오류가 발생했습니다.');
      }
    });

    // 채팅방 퇴장
    socket.on('leave_room', (groupId) => {
      socket.leave(`group_${groupId}`);
    });

    // 메시지 전송
    socket.on('send_message', async ({ groupId, content }) => {
      if (!content?.trim()) return;

      try {
        // 멤버 재검증 (보안)
        const [[member]] = await db.execute(
          'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, socket.userId]
        );
        if (!member) {
          socket.emit('error_message', '메시지 전송 권한이 없습니다.');
          return;
        }

        // DB 저장
        const [result] = await db.execute(
          'INSERT INTO messages (group_id, sender_id, content) VALUES (?, ?, ?)',
          [groupId, socket.userId, content.trim()]
        );

        // 발신자 정보 조회
        const [[sender]] = await db.execute(
          'SELECT nickname, profile_img FROM users WHERE id = ?',
          [socket.userId]
        );

        // 방 전체에 브로드캐스트 (발신자 포함)
        const message = {
          id: result.insertId,
          group_id: groupId,
          sender_id: socket.userId,
          sender_nickname: socket.nickname,
          sender_profile_img: sender.profile_img,
          content: content.trim(),
          created_at: new Date().toISOString(),
          reactions: [],
        };
        
        io.to(`group_${groupId}`).emit('new_message', message);
      } catch (err) {
        console.error('send_message error:', err.message);
        socket.emit('error_message', '메시지 전송 중 오류가 발생했습니다.');
      }
    });

    // 반응 토글 (있으면 제거, 없으면 추가)
    socket.on('toggle_reaction', async ({ messageId, reaction }) => {
      console.log('### toggle_reaction 수신:', messageId, reaction);
      try {
        // 이미 눌렀는지 확인
        const [[existing]] = await db.execute(
          'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
          [messageId, socket.userId, reaction]
        );

        if (existing) {
          await db.execute('DELETE FROM message_reactions WHERE id = ?', [existing.id]);
        } else {
          await db.execute(
            'INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)',
            [messageId, socket.userId, reaction]
          );
        }

        // 어느 방에 알릴지 group_id 조회
        const [[msg]] = await db.execute(
          'SELECT group_id FROM messages WHERE id = ?', [messageId]
        );
        if (!msg) return;

        // 이 메시지의 반응 집계 (종류별 카운트 + 누른 사람 목록)
        const [rows] = await db.execute(
          `SELECT reaction, COUNT(*) AS count,
                  JSON_ARRAYAGG(user_id) AS user_ids
          FROM message_reactions
          WHERE message_id = ?
          GROUP BY reaction`,
          [messageId]
        );

        const reactions = rows.map((r) => ({
          reaction: r.reaction,
          count: Number(r.count),
          userIds: typeof r.user_ids === 'string'
              ? JSON.parse(r.user_ids)
              : r.user_ids,
        }));

        console.log('### reaction_updated 발송:', msg.group_id, JSON.stringify(reactions));
        io.to(`group_${msg.group_id}`).emit('reaction_updated', {
          messageId,
          reactions,
        });
      } catch (err) {
        console.error('toggle_reaction error:', err.message);
        socket.emit('error_message', '반응 처리 중 오류가 발생했습니다.');
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
    });
  });

  // 반응 토글


  return io;
}

module.exports = initSocket;