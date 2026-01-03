// backend/src/services/PaymentService.js
const Razorpay = require('razorpay');
const paypal = require('@paypal/checkout-server-sdk');
const crypto = require('crypto');

class PaymentService {
  constructor() {
    // Razorpay Initialization
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    
    // PayPal Environment
    this.paypalEnvironment = new paypal.core.SandboxEnvironment(
      process.env.PAYPAL_CLIENT_ID,
      process.env.PAYPAL_CLIENT_SECRET
    );
    this.paypalClient = new paypal.core.PayPalHttpClient(this.paypalEnvironment);
  }
  
  // Create Razorpay Order
  async createRazorpayOrder(orderData) {
    try {
      const options = {
        amount: orderData.amount * 100, // amount in paise
        currency: orderData.currency || 'INR',
        receipt: orderData.receipt,
        payment_capture: 1,
        notes: {
          userId: orderData.userId,
          chatId: orderData.chatId,
          earnerId: orderData.earnerId
        }
      };
      
      const order = await this.razorpay.orders.create(options);
      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID
      };
    } catch (error) {
      throw new Error(`Razorpay order creation failed: ${error.message}`);
    }
  }
  
  // Verify Razorpay Payment
  async verifyRazorpayPayment(paymentId, orderId, signature) {
    try {
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');
      
      if (generatedSignature === signature) {
        return { success: true, verified: true };
      }
      return { success: false, verified: false };
    } catch (error) {
      throw new Error(`Payment verification failed: ${error.message}`);
    }
  }
  
  // Create PayPal Order
  async createPayPalOrder(orderData) {
    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: orderData.currency || 'USD',
            value: orderData.amount.toString()
          },
          description: `Chat session with ${orderData.earnerName}`,
          custom_id: orderData.chatId
        }],
        application_context: {
          brand_name: 'QuikChat',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${process.env.CLIENT_URL}/payment/success`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancel`
        }
      });
      
      const order = await this.paypalClient.execute(request);
      return {
        success: true,
        orderId: order.result.id,
        approveUrl: order.result.links.find(link => link.rel === 'approve').href
      };
    } catch (error) {
      throw new Error(`PayPal order creation failed: ${error.message}`);
    }
  }
  
  // Capture PayPal Payment
  async capturePayPalOrder(orderId) {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.requestBody({});
      const capture = await this.paypalClient.execute(request);
      
      if (capture.result.status === 'COMPLETED') {
        return {
          success: true,
          transactionId: capture.result.purchase_units[0].payments.captures[0].id,
          amount: capture.result.purchase_units[0].amount.value,
          currency: capture.result.purchase_units[0].amount.currency_code
        };
      }
      return { success: false, message: 'Payment not completed' };
    } catch (error) {
      throw new Error(`PayPal capture failed: ${error.message}`);
    }
  }
  
  // Create Wallet Top-up
  async createWalletTopUp(userId, amount, currency, method) {
    try {
      let paymentData;
      
      switch (method) {
        case 'razorpay':
          paymentData = await this.createRazorpayOrder({
            amount,
            currency,
            receipt: `wallet_${userId}_${Date.now()}`,
            userId,
            type: 'wallet_topup'
          });
          break;
          
        case 'paypal':
          paymentData = await this.createPayPalOrder({
            amount,
            currency,
            userId,
            type: 'wallet_topup'
          });
          break;
          
        default:
          throw new Error('Unsupported payment method');
      }
      
      // Store payment intent in database
      const PaymentIntent = require('../models/PaymentIntent');
      const paymentIntent = await PaymentIntent.create({
        userId,
        amount,
        currency,
        method,
        status: 'pending',
        paymentData,
        type: 'wallet_topup'
      });
      
      return {
        success: true,
        paymentIntentId: paymentIntent._id,
        ...paymentData
      };
    } catch (error) {
      throw new Error(`Wallet top-up failed: ${error.message}`);
    }
  }
  
  // Process Withdrawal Request
  async processWithdrawal(userId, amount, method, details) {
    try {
      // Check minimum withdrawal amount
      const minWithdrawal = method === 'bank' ? 500 : 10;
      if (amount < minWithdrawal) {
        throw new Error(`Minimum withdrawal amount is ${minWithdrawal}`);
      }
      
      // Check wallet balance
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (user.wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }
      
      // Create withdrawal record
      const Withdrawal = require('../models/Withdrawal');
      const withdrawal = await Withdrawal.create({
        userId,
        amount,
        method,
        details,
        status: 'pending',
        processedAt: null
      });
      
      // Deduct from wallet
      user.wallet.balance -= amount;
      user.wallet.pendingWithdrawal += amount;
      await user.save();
      
      // Process based on method (in production, integrate with payout APIs)
      await this.initiatePayout(withdrawal);
      
      return {
        success: true,
        withdrawalId: withdrawal._id,
        message: 'Withdrawal request submitted successfully'
      };
    } catch (error) {
      throw new Error(`Withdrawal processing failed: ${error.message}`);
    }
  }
  
  // Initiate Payout (Integrate with Razorpay/PayPal Payouts)
  async initiatePayout(withdrawal) {
    // Implementation depends on your payout provider
    // Razorpay: https://razorpay.com/docs/payouts/
    // PayPal: https://developer.paypal.com/docs/payouts/
    
    // This is a placeholder implementation
    setTimeout(async () => {
      const Withdrawal = require('../models/Withdrawal');
      const User = require('../models/User');
      
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
      await withdrawal.save();
      
      const user = await User.findById(withdrawal.userId);
      user.wallet.pendingWithdrawal -= withdrawal.amount;
      user.wallet.totalWithdrawn += withdrawal.amount;
      await user.save();
      
      // Send notification
      this.sendNotification(userId, 'withdrawal_completed', { amount: withdrawal.amount });
    }, 30000); // Simulate 30 second processing
  }
  
  // Refund Payment
  async refundPayment(paymentId, amount, reason) {
    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: amount * 100,
        notes: { reason }
      });
      
      return {
        success: true,
        refundId: refund.id,
        status: refund.status
      };
    } catch (error) {
      throw new Error(`Refund failed: ${error.message}`);
    }
  }
  
  // Get Payment Analytics
  async getPaymentAnalytics(timeRange = 'month') {
    const Payment = require('../models/Payment');
    
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case 'day':
        startDate = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }
    
    const analytics = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
          averageAmount: { $avg: '$amount' },
          byMethod: {
            $push: {
              method: '$paymentMethod',
              amount: '$amount'
            }
          }
        }
      },
      {
        $project: {
          totalAmount: 1,
          totalTransactions: 1,
          averageAmount: 1,
          paymentMethods: {
            $arrayToObject: {
              $map: {
                input: '$byMethod',
                as: 'item',
                in: {
                  k: '$$item.method',
                  v: { $sum: '$$item.amount' }
                }
              }
            }
          }
        }
      }
    ]);
    
    return analytics[0] || {};
  }
}

module.exports = new PaymentService();
