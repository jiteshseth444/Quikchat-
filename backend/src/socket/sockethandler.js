// backend/src/socket/socketHandler.js
const jwt = require('jsonwebtoken');
const ChatService = require('../services/ChatService');
const PaymentService = require('../services/PaymentService');

module.exports = (io, redisClient) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      
      // Store user connection in Redis
      await redisClient.hSet(`user:${socket.userId}`, 'socketId', socket.id);
      await redisClient.hSet(`user:${socket.userId}`, 'status', 'online');
      await redisClient.expire(`user:${socket.userId}`, 86400); // 24 hours
      
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });
  
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);
    
    // Join user to their personal room
    socket.join(`user:${socket.userId}`);
    
    // Update user status
    socket.emit('connected', { userId: socket.userId });
    socket.broadcast.emit('user-status', { 
      userId: socket.userId, 
      status: 'online' 
    });
    
    // Chat Events
    socket.on('join-chat', async (chatId) => {
      socket.join(`chat:${chatId}`);
      await ChatService.updateUserPresence(chatId, socket.userId, true);
      socket.to(`chat:${chatId}`).emit('user-joined', { userId: socket.userId });
    });
    
    socket.on('send-message', async (data) => {
      try {
        const { chatId, content, type, media } = data;
        
        // Check if chat is paid and has time remaining
        const chat = await ChatService.getChat(chatId);
        if (chat.type === 'private_paid') {
          const hasTime = await ChatService.checkChatTimeRemaining(chatId);
          if (!hasTime) {
            socket.emit('chat-error', { message: 'Chat time expired' });
            return;
          }
        }
        
        // Save message
        const message = await ChatService.saveMessage({
          chatId,
          senderId: socket.userId,
          content,
          type,
          media
        });
        
        // Emit to chat room
        io.to(`chat:${chatId}`).emit('new-message', message);
        
        // Update last message
        await ChatService.updateLastMessage(chatId, message);
        
        // Send notification to other participants
        chat.participants.forEach(participant => {
          if (participant.userId.toString() !== socket.userId) {
            io.to(`user:${participant.userId}`).emit('message-notification', {
              chatId,
              message: message.content,
              sender: socket.userId
            });
          }
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
    
    socket.on('typing', (data) => {
      const { chatId, isTyping } = data;
      socket.to(`chat:${chatId}`).emit('typing-indicator', {
        userId: socket.userId,
        isTyping
      });
    });
    
    socket.on('read-receipt', async (data) => {
      const { messageId, chatId } = data;
      await ChatService.markAsRead(messageId, socket.userId);
      socket.to(`chat:${chatId}`).emit('message-read', {
        messageId,
        userId: socket.userId
      });
    });
    
    // Payment Events
    socket.on('request-private-chat', async (data) => {
      try {
        const { earnerId, duration, chatType } = data;
        
        // Check earner availability
        const earner = await UserService.getUser(earnerId);
        if (!earner.earnerProfile.isActive) {
          socket.emit('error', { message: 'Earner is not available' });
          return;
        }
        
        // Calculate cost
        const rate = earner.earnerProfile.hourlyRate / 60; // per minute
        const amount = rate * duration;
        
        // Create payment session
        const paymentSession = await PaymentService.createChatPayment({
          userId: socket.userId,
          earnerId,
          amount,
          duration,
          chatType
        });
        
        // Emit payment request
        socket.emit('payment-request', {
          sessionId: paymentSession._id,
          amount,
          duration,
          earnerName: earner.username
        });
        
        // Notify earner
        socket.to(`user:${earnerId}`).emit('chat-request', {
          requestId: paymentSession._id,
          userId: socket.userId,
          duration,
          amount
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
    
    socket.on('accept-chat-request', async (data) => {
      try {
        const { requestId } = data;
        
        // Update payment status
        await PaymentService.acceptPayment(requestId);
        
        // Create chat room
        const chat = await ChatService.createPrivateChat(requestId);
        
        // Notify both users
        io.to(`chat:${chat._id}`).emit('chat-started', {
          chatId: chat._id,
          duration: chat.paymentDetails.totalDuration
        });
        
        // Start chat timer
        startChatTimer(chat._id, chat.paymentDetails.totalDuration);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
    
    socket.on('extend-chat', async (data) => {
      try {
        const { chatId, additionalMinutes } = data;
        
        // Calculate extension cost
        const chat = await ChatService.getChat(chatId);
        const earner = await UserService.getUser(chat.participants.find(p => p.role === 'earner').userId);
        const rate = earner.earnerProfile.hourlyRate / 60;
        const amount = rate * additionalMinutes;
        
        // Create extension payment
        const payment = await PaymentService.createExtensionPayment({
          chatId,
          userId: socket.userId,
          amount,
          minutes: additionalMinutes
        });
        
        socket.emit('extension-payment-request', {
          paymentId: payment._id,
          amount,
          minutes: additionalMinutes
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
    
    // Call Events
    socket.on('call-user', async (data) => {
      const { userId, type, isVideo } = data;
      
      // Check if user can receive calls
      const user = await UserService.getUser(userId);
      if (user.role === 'female_earner' && !user.earnerProfile.services[type]) {
        socket.emit('error', { message: 'This service is not available' });
        return;
      }
      
      // Create call room
      const callId = `call_${Date.now()}_${socket.userId}_${userId}`;
      
      socket.to(`user:${userId}`).emit('incoming-call', {
        callId,
        callerId: socket.userId,
        type,
        isVideo
      });
      
      socket.emit('call-initiated', { callId });
    });
    
    socket.on('accept-call', (data) => {
      const { callId } = data;
      io.to(callId).emit('call-accepted');
    });
    
    socket.on('reject-call', (data) => {
      const { callId } = data;
      io.to(callId).emit('call-rejected');
    });
    
    socket.on('join-call', (callId) => {
      socket.join(callId);
    });
    
    socket.on('call-signal', (data) => {
      const { callId, signal } = data;
      socket.to(callId).emit('call-signal', { 
        signal, 
        userId: socket.userId 
      });
    });
    
    socket.on('end-call', (callId) => {
      io.to(callId).emit('call-ended');
    });
    
    // Presence Events
    socket.on('update-presence', async (data) => {
      const { status, customStatus } = data;
      await redisClient.hSet(`user:${socket.userId}`, 'status', status);
      if (customStatus) {
        await redisClient.hSet(`user:${socket.userId}`, 'customStatus', customStatus);
      }
      
      socket.broadcast.emit('presence-update', {
        userId: socket.userId,
        status,
        customStatus
      });
    });
    
    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.userId}`);
      
      // Update status to offline
      await redisClient.hSet(`user:${socket.userId}`, 'status', 'offline');
      await redisClient.hSet(`user:${socket.userId}`, 'lastSeen', new Date().toISOString());
      
      socket.broadcast.emit('user-status', { 
        userId: socket.userId, 
        status: 'offline' 
      });
      
      // Leave all rooms
      socket.rooms.forEach(room => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });
    });
  });
  
  // Helper function for chat timer
  function startChatTimer(chatId, duration) {
    const timer = setTimeout(async () => {
      try {
        // End chat when time is up
        await ChatService.endChat(chatId);
        
        // Notify participants
        io.to(`chat:${chatId}`).emit('chat-time-ended', { chatId });
        
        // Auto-extend if enabled
        const chat = await ChatService.getChat(chatId);
        if (chat.paymentDetails.autoExtend) {
          // Charge for extension
          // Implementation depends on your logic
        }
      } catch (error) {
        console.error('Chat timer error:', error);
      }
    }, duration * 60 * 1000);
    
    // Store timer reference
    chatTimers.set(chatId, timer);
  }
};
