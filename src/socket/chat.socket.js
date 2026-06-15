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
    console.log('### 소켓 인증: 토큰 없음');
    return next(new Error('인증 토큰이 없습니다.'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [[user]] = await db.execute(
      'SELECT nickname, profile_img FROM users WHERE id = ?', [decoded.userId]
    );
    socket.userId = decoded.userId;
    socket.nickname = user?.nickname ?? decoded.nickname;   // 본명 대신 DB 닉네임
    socket.profileImg = user?.profile_img ?? null;
    next();
  } catch (err) {
    console.log('### 소켓 인증 실패:', err.name, err.message);   // ← 추가
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
    socket.on('send_message', async ({ groupId, content, replyToId }) => {  // ← replyToId 추가
      if (!content?.trim()) return;
      try {
        const [[member]] = await db.execute(
          'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, socket.userId]
        );
        if (!member) {
          socket.emit('error_message', '메시지 전송 권한이 없습니다.');
          return;
        }

        // DB 저장 (reply_to_id 포함)
        const [result] = await db.execute(
          'INSERT INTO messages (group_id, sender_id, content, reply_to_id) VALUES (?, ?, ?, ?)',
          [groupId, socket.userId, content.trim(), replyToId ?? null]
        );

        const [[sender]] = await db.execute(
          'SELECT nickname, profile_img FROM users WHERE id = ?',
          [socket.userId]
        );

        // 답장 대상 원본 조회 (replyToId 있을 때만)
        let replyTo = null;
        if (replyToId) {
          const [[orig]] = await db.execute(
            `SELECT m.id, m.content, u.nickname AS sender_nickname
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE m.id = ?`,
            [replyToId]
          );
          if (orig) {
            replyTo = {
              id: orig.id,
              content: orig.content,
              sender_nickname: orig.sender_nickname,
            };
          }
        }

        const message = {
          id: result.insertId,
          group_id: groupId,
          sender_id: socket.userId,
          sender_nickname: socket.nickname,
          sender_profile_img: sender.profile_img,
          content: content.trim(),
          created_at: new Date().toISOString(),
          reactions: [],
          reply_to: replyTo,   // ← 추가 (없으면 null)
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
    
    socket.on('mark_read', async ({ groupId, messageId }) => {
      try {
        const mid = Number(messageId);
        if (!groupId || !mid) return;
        await db.execute(
          `UPDATE group_members SET last_read_message_id = ?
            WHERE group_id = ? AND user_id = ? AND last_read_message_id < ?`,
          [mid, groupId, socket.userId, mid]
        );
        io.to(`group_${groupId}`).emit('read_updated', {
          userId: socket.userId, lastReadId: mid,
        });
      } catch (e) { console.error('mark_read error:', e.message); }
    });
  });

  return io;
}

module.exports = initSocket;