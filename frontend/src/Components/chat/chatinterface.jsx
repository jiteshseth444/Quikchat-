// frontend/src/components/chat/ChatInterface.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Send, 
  Mic, 
  Video, 
  Phone, 
  Image as ImageIcon, 
  Smile, 
  Paperclip,
  MoreVertical,
  X,
  Clock,
  DollarSign,
  Shield,
  Volume2
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import EmojiPicker from 'emoji-picker-react';
import MessageBubble from './MessageBubble';
import ChatSidebar from './ChatSidebar';
import CallModal from '../call/CallModal';
import PaymentModal from '../payment/PaymentModal';

const ChatInterface = () => {
  const { chatId } = useParams();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [chatInfo, setChatInfo] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Fetch chat data
  useEffect(() => {
    if (chatId) {
      fetchChatData();
      joinChatRoom();
    }
    
    return () => {
      if (chatId && socket) {
        socket.emit('leave-chat', chatId);
      }
    };
  }, [chatId, socket]);
  
  // Socket event listeners
  useEffect(() => {
    if (!socket) return;
    
    socket.on('new-message', handleNewMessage);
    socket.on('typing-indicator', handleTyping);
    socket.on('message-read', handleMessageRead);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('chat-time-update', handleTimeUpdate);
    
    return () => {
      socket.off('new-message');
      socket.off('typing-indicator');
      socket.off('message-read');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('chat-time-update');
    };
  }, [socket]);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const fetchChatData = async () => {
    try {
      const response = await fetch(`/api/v1/chat/${chatId}`);
      const data = await response.json();
      setChatInfo(data.chat);
      setMessages(data.messages);
      setRemainingTime(data.remainingTime || 0);
    } catch (error) {
      console.error('Error fetching chat:', error);
    }
  };
  
  const joinChatRoom = () => {
    if (socket && chatId) {
      socket.emit('join-chat', chatId);
    }
  };
  
  const handleNewMessage = (message) => {
    setMessages(prev => [...prev, message]);
    
    // Mark as read
    if (socket) {
      socket.emit('read-receipt', { 
        messageId: message._id, 
        chatId 
      });
    }
  };
  
  const handleTyping = ({ userId, isTyping }) => {
    setTypingUsers(prev => {
      if (isTyping) {
        return [...new Set([...prev, userId])];
      } else {
        return prev.filter(id => id !== userId);
      }
    });
  };
  
  const handleSendMessage = () => {
    if (!inputMessage.trim() || !socket) return;
    
    const messageData = {
      chatId,
      content: inputMessage,
      type: 'text'
    };
    
    socket.emit('send-message', messageData);
    setInputMessage('');
    setShowEmojiPicker(false);
  };
  
  const handleTypingStart = () => {
    if (socket) {
      socket.emit('typing', { chatId, isTyping: true });
      setIsTyping(true);
    }
  };
  
  const handleTypingStop = () => {
    if (socket) {
      socket.emit('typing', { chatId, isTyping: false });
      setIsTyping(false);
    }
  };
  
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Upload file to cloud storage
    uploadFile(file);
  };
  
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/v1/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (socket) {
        socket.emit('send-message', {
          chatId,
          content: '',
          type: file.type.startsWith('image/') ? 'image' : 
                 file.type.startsWith('video/') ? 'video' : 'file',
          media: {
            url: data.url,
            mimeType: file.type,
            size: file.size
          }
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
    }
  };
  
  const startVoiceCall = () => {
    if (chatInfo && chatInfo.participants) {
      const otherUser = chatInfo.participants.find(p => p.userId !== user._id);
      if (otherUser) {
        socket.emit('call-user', {
          userId: otherUser.userId,
          type: 'voice',
          isVideo: false
        });
        setShowCallModal(true);
      }
    }
  };
  
  const startVideoCall = () => {
    if (chatInfo && chatInfo.participants) {
      const otherUser = chatInfo.participants.find(p => p.userId !== user._id);
      if (otherUser) {
        socket.emit('call-user', {
          userId: otherUser.userId,
          type: 'video',
          isVideo: true
        });
        setShowCallModal(true);
      }
    }
  };
  
  const extendChatTime = () => {
    setShowPaymentModal(true);
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (!chatId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-400 to-pink-500 flex items-center justify-center">
            <MessageCircle className="w-12 h-12 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Select a chat to start messaging
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Choose from your existing conversations or start a new one
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Chat Sidebar */}
      <ChatSidebar 
        activeChatId={chatId}
        onChatSelect={() => {}}
      />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <img 
                src={chatInfo?.otherUser?.profilePicture || '/default-avatar.png'} 
                alt={chatInfo?.otherUser?.name}
                className="w-12 h-12 rounded-full border-2 border-purple-500"
              />
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                chatInfo?.otherUser?.isOnline ? 'bg-green-500' : 'bg-gray-400'
              }`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {chatInfo?.otherUser?.name || 'Loading...'}
              </h2>
              <div className="flex items-center space-x-2">
                {typingUsers.length > 0 ? (
                  <span className="text-sm text-purple-600 dark:text-purple-400">
                    typing...
                  </span>
                ) : chatInfo?.otherUser?.isOnline ? (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Online
                  </span>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Last seen {chatInfo?.otherUser?.lastSeen}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Chat Timer for Paid Chats */}
            {remainingTime > 0 && (
              <div className="flex items-center space-x-2 px-4 py-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  {formatTime(remainingTime)}
                </span>
                <button 
                  onClick={extendChatTime}
                  className="ml-2 px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Extend
                </button>
              </div>
            )}
            
            {/* Call Buttons */}
            <button 
              onClick={startVoiceCall}
              className="p-3 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
              title="Voice Call"
            >
              <Phone className="w-5 h-5" />
            </button>
            
            <button 
              onClick={startVideoCall}
              className="p-3 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              title="Video Call"
            >
              <Video className="w-5 h-5" />
            </button>
            
            {/* More Options */}
            <div className="relative">
              <button className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-32 h-32 mb-6 rounded-full bg-gradient-to-r from-purple-400 to-pink-500 flex items-center justify-center opacity-20">
                <MessageCircle className="w-20 h-20 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                No messages yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
                Start the conversation by sending a message. Be respectful and follow community guidelines.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble 
                  key={message._id} 
                  message={message} 
                  isOwn={message.sender === user._id}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        
        {/* Chat Input Area */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="mb-2 flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-75" />
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-150" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {typingUsers.length} user{typingUsers.length > 1 ? 's' : ''} typing...
              </span>
            </div>
          )}
          
          <div className="flex items-center space-x-4">
            {/* Attachment Button */}
            <button 
              onClick={() => fileInputRef.current.click()}
              className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,video/*,audio/*"
            />
            
            {/* Emoji Button */}
            <div className="relative">
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Emoji"
              >
                <Smile className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              
              {showEmojiPicker && (
                <div className="absolute bottom-full mb-2">
                  <EmojiPicker 
                    onEmojiClick={(emojiData) => {
                      setInputMessage(prev => prev + emojiData.emoji);
                    }}
                    theme="dark"
                  />
                </div>
              )}
            </div>
            
            {/* Message Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  if (!isTyping && e.target.value) {
                    handleTypingStart();
                  }
                }}
                onBlur={handleTypingStop}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type your message here..."
                className="w-full px-6 py-4 bg-gray-100 dark:bg-gray-700 rounded-full border-none focus:ring-2 focus:ring-purple-500 focus:outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
              
              {/* Voice Message Button */}
              <button className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <Mic className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            
            {/* Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim()}
              className={`p-4 rounded-full transition-all ${
                inputMessage.trim() 
                  ? 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white shadow-lg' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Call Modal */}
      {showCallModal && (
        <CallModal 
          onClose={() => setShowCallModal(false)}
          callType="voice"
        />
      )}
      
      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal 
          onClose={() => setShowPaymentModal(false)}
          type="chat_extension"
          chatId={chatId}
        />
      )}
    </div>
  );
};

export default ChatInterface;
