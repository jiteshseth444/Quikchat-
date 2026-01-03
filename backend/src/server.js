// backend/src/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const http = require('http');
const compression = require('compression');
const morgan = require('morgan');
const cluster = require('cluster');
const os = require('os');
const redis = require('redis');

// Multi-process clustering for performance
if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  console.log(`Master ${process.pid} is running`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  const app = express();
  const server = http.createServer(app);
  
  // Socket.IO with Redis Adapter for scaling
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true
    },
    adapter: require('socket.io-redis')({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    })
  });
  
  // Middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com"],
        connectSrc: ["'self'", "https://api.razorpay.com", "https://api.paypal.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"]
      }
    }
  }));
  
  app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
  }));
  
  app.use(compression());
  app.use(morgan('combined'));
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
  });
  app.use('/api/', limiter);
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Database connection with retry logic
  const connectWithRetry = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        retryWrites: true,
        w: 'majority'
      });
      console.log('MongoDB connected successfully');
    } catch (err) {
      console.error('MongoDB connection error:', err);
      setTimeout(connectWithRetry, 5000);
    }
  };
  connectWithRetry();
  
  // Redis connection
  const redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
  });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  redisClient.connect();
  
  // Import routes
  const authRoutes = require('./routes/auth');
  const chatRoutes = require('./routes/chat');
  const paymentRoutes = require('./routes/payment');
  const userRoutes = require('./routes/user');
  const adminRoutes = require('./routes/admin');
  const walletRoutes = require('./routes/wallet');
  
  // API routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/chat', chatRoutes);
  app.use('/api/v1/payment', paymentRoutes);
  app.use('/api/v1/user', userRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/wallet', walletRoutes);
  
  // Health check
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  // Socket.IO implementation
  require('./socket/socketHandler')(io, redisClient);
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  });
  
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Worker ${process.pid} started on port ${PORT}`);
  });
      }
