const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('../config/db');

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: '*' },  // 개발용. 배포 시 도메인 제한
  });

  // 1. 소켓 인증 미들웨어 — 연결 시 JWT 검증
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('인증 토큰이 없습니다.'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.nickname = decoded.nickname;
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
          sender_nickname: sender.nickname,
          sender_profile_img: sender.profile_img,
          content: content.trim(),
          created_at: new Date().toISOString(),
        };
        io.to(`group_${groupId}`).emit('new_message', message);
      } catch (err) {
        console.error('send_message error:', err.message);
        socket.emit('error_message', '메시지 전송 중 오류가 발생했습니다.');
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
    });
  });

  return io;
}

module.exports = initSocket;