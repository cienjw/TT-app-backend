const express = require('express');
const http    = require('http');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
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

// 헬스체크
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.io 초기화
initSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));