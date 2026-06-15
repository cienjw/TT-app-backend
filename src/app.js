const express = require('express');
const http    = require('http');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const matchingRoutes = require('./routes/matching.routes');
const footprintRoutes = require('./routes/footprint.routes');
require('dotenv').config();

const authRoutes  = require('./routes/auth.routes');
const userRoutes  = require('./routes/user.routes');
const groupRoutes = require('./routes/group.routes');
const initSocket  = require('./socket/chat.socket');

const app    = express();
const server = http.createServer(app);

// 미들웨어
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(morgan('dev'));
app.use(express.json());

// 라우트
app.use('/api/auth',   authRoutes);
app.use('/api/users',  userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/footprints', footprintRoutes);

// 헬스체크
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.io 초기화
initSocket(server);

const matchingService = require('./services/matching.service');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// 매칭 워커 (5초 주기)
setInterval(() => {
  matchingService.runMatchingCycle().catch((e) =>
    console.error('matching worker:', e.message));
}, 5000);

// 채팅방 만료 체크 (1분 주기)
setInterval(() => {
  matchingService.expireOldGroups().catch((e) =>
    console.error('expire worker:', e.message));
}, 60000);