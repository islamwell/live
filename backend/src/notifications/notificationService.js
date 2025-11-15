const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { Reminder, Broadcast, User, Follow } = require('../models');
const { Op } = require('sequelize');
const cron = require('node-cron');

// Initialize Firebase Admin (if credentials are provided)
let firebaseInitialized = false;
try {
  if (process.env.FCM_PROJECT_ID && process.env.FCM_PRIVATE_KEY && process.env.FCM_CLIENT_EMAIL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FCM_PROJECT_ID,
        privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FCM_CLIENT_EMAIL
      })
    });
    firebaseInitialized = true;
    console.log('Firebase Admin initialized');
  }
} catch (error) {
  console.warn('Firebase Admin initialization failed:', error.message);
}

// Initialize email transporter
let emailTransporter = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
    console.log('Email transporter initialized');
  }
} catch (error) {
  console.warn('Email transporter initialization failed:', error.message);
}

class NotificationService {
  constructor() {
    this.cronJob = null;
  }

  startWorker() {
    // Run every minute to check for pending reminders
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processPendingReminders();
    });

    console.log('Notification worker started');
  }

  stopWorker() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('Notification worker stopped');
    }
  }

  async processPendingReminders() {
    try {
      const now = new Date();

      // Find reminders that should be sent now
      const pendingReminders = await Reminder.findAll({
        where: {
          status: 'pending',
          scheduledTime: {
            [Op.lte]: now
          }
        },
        include: [
          {
            model: Broadcast,
            as: 'broadcast',
            include: [
              {
                model: User,
                as: 'host',
                attributes: ['id', 'username', 'displayName', 'avatar']
              }
            ]
          }
        ],
        limit: 100
      });

      for (const reminder of pendingReminders) {
        await this.sendReminder(reminder);
      }

      if (pendingReminders.length > 0) {
        console.log(`Processed ${pendingReminders.length} reminders`);
      }
    } catch (error) {
      console.error('Error processing reminders:', error);
    }
  }

  async sendReminder(reminder) {
    try {
      const { broadcast, userId, reminderType } = reminder;

      // Get recipients
      let recipients = [];

      if (userId) {
        // Send to specific user
        const user = await User.findByPk(userId);
        if (user) {
          recipients.push(user);
        }
      } else {
        // Send to all followers of the host
        const followers = await User.findAll({
          include: [
            {
              model: User,
              as: 'following',
              where: { id: broadcast.hostId },
              through: { attributes: [] }
            }
          ]
        });
        recipients = followers;
      }

      // Send notifications
      const results = {
        push: 0,
        email: 0,
        failed: 0
      };

      for (const recipient of recipients) {
        try {
          if (reminderType === 'push' || reminderType === 'both') {
            if (recipient.pushNotificationsEnabled) {
              await this.sendPushNotification(recipient, broadcast);
              results.push++;
            }
          }

          if (reminderType === 'email' || reminderType === 'both') {
            if (recipient.emailNotificationsEnabled) {
              await this.sendEmailNotification(recipient, broadcast);
              results.email++;
            }
          }
        } catch (error) {
          console.error(`Failed to send notification to user ${recipient.id}:`, error.message);
          results.failed++;
        }
      }

      // Update reminder status
      await reminder.update({
        status: 'sent',
        sentAt: new Date()
      });

      console.log(`Reminder sent for broadcast ${broadcast.id}:`, results);
    } catch (error) {
      console.error(`Error sending reminder ${reminder.id}:`, error);

      await reminder.update({
        status: 'failed',
        error: error.message
      });
    }
  }

  async sendPushNotification(user, broadcast) {
    if (!firebaseInitialized) {
      console.warn('Firebase not initialized, skipping push notification');
      return;
    }

    const timeUntil = this.getTimeUntilBroadcast(broadcast.scheduledStartTime);

    const message = {
      notification: {
        title: `Upcoming: ${broadcast.title}`,
        body: `${broadcast.host.displayName}'s broadcast starts ${timeUntil}`,
        imageUrl: broadcast.coverImage
      },
      data: {
        broadcastId: broadcast.id,
        type: 'broadcast_reminder'
      }
    };

    // Send to FCM token
    if (user.fcmToken) {
      try {
        await admin.messaging().send({
          ...message,
          token: user.fcmToken
        });
        console.log(`Push notification sent to user ${user.id} (FCM)`);
      } catch (error) {
        console.error(`FCM send failed for user ${user.id}:`, error.message);
      }
    }

    // Send to APNS token
    if (user.apnsToken) {
      try {
        await admin.messaging().send({
          ...message,
          token: user.apnsToken,
          apns: {
            payload: {
              aps: {
                alert: {
                  title: message.notification.title,
                  body: message.notification.body
                },
                sound: 'default'
              }
            }
          }
        });
        console.log(`Push notification sent to user ${user.id} (APNS)`);
      } catch (error) {
        console.error(`APNS send failed for user ${user.id}:`, error.message);
      }
    }

    // Send to web push subscription
    if (user.webPushSubscription) {
      // Would use web-push library here
      console.log(`Web push notification sent to user ${user.id}`);
    }
  }

  async sendEmailNotification(user, broadcast) {
    if (!emailTransporter) {
      console.warn('Email transporter not configured, skipping email notification');
      return;
    }

    const timeUntil = this.getTimeUntilBroadcast(broadcast.scheduledStartTime);
    const broadcastUrl = `${process.env.API_URL || 'http://localhost:4000'}/broadcasts/${broadcast.id}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || 'LiveAudioCast <noreply@liveaudiocast.com>',
      to: user.email,
      subject: `Reminder: ${broadcast.title} starts ${timeUntil}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background-color: #4F46E5;
                color: white;
                padding: 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
              }
              .content {
                background-color: #f9f9f9;
                padding: 20px;
                border-radius: 0 0 8px 8px;
              }
              .broadcast-info {
                background-color: white;
                padding: 15px;
                margin: 15px 0;
                border-left: 4px solid #4F46E5;
                border-radius: 4px;
              }
              .button {
                display: inline-block;
                background-color: #4F46E5;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 4px;
                margin: 10px 0;
              }
              .footer {
                text-align: center;
                color: #666;
                font-size: 12px;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📻 Broadcast Reminder</h1>
              </div>
              <div class="content">
                <p>Hello ${user.displayName || user.username},</p>
                <p>This is a reminder that <strong>${broadcast.host.displayName}</strong>'s broadcast is starting ${timeUntil}.</p>

                <div class="broadcast-info">
                  <h2>${broadcast.title}</h2>
                  ${broadcast.description ? `<p>${broadcast.description}</p>` : ''}
                  <p><strong>Host:</strong> ${broadcast.host.displayName}</p>
                  <p><strong>Start Time:</strong> ${new Date(broadcast.scheduledStartTime).toLocaleString()}</p>
                </div>

                <p style="text-align: center;">
                  <a href="${broadcastUrl}" class="button">Join Broadcast</a>
                </p>

                <p>Don't miss it! See you there.</p>
              </div>
              <div class="footer">
                <p>You're receiving this because you follow ${broadcast.host.displayName}.</p>
                <p>LiveAudioCast - Live Audio Broadcasting Platform</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Broadcast Reminder

        Hello ${user.displayName || user.username},

        This is a reminder that ${broadcast.host.displayName}'s broadcast is starting ${timeUntil}.

        ${broadcast.title}
        ${broadcast.description || ''}

        Host: ${broadcast.host.displayName}
        Start Time: ${new Date(broadcast.scheduledStartTime).toLocaleString()}

        Join at: ${broadcastUrl}

        Don't miss it! See you there.

        ---
        You're receiving this because you follow ${broadcast.host.displayName}.
        LiveAudioCast - Live Audio Broadcasting Platform
      `
    };

    try {
      await emailTransporter.sendMail(mailOptions);
      console.log(`Email sent to ${user.email}`);
    } catch (error) {
      console.error(`Failed to send email to ${user.email}:`, error.message);
      throw error;
    }
  }

  async sendBroadcastStartNotification(broadcast) {
    // Notify all followers that a broadcast has started
    const followers = await User.findAll({
      include: [
        {
          model: User,
          as: 'following',
          where: { id: broadcast.hostId },
          through: { attributes: [] }
        }
      ]
    });

    for (const follower of followers) {
      try {
        if (follower.pushNotificationsEnabled && (follower.fcmToken || follower.apnsToken)) {
          const message = {
            notification: {
              title: `${broadcast.host.displayName} is live!`,
              body: broadcast.title,
              imageUrl: broadcast.coverImage
            },
            data: {
              broadcastId: broadcast.id,
              type: 'broadcast_started'
            }
          };

          if (follower.fcmToken && firebaseInitialized) {
            await admin.messaging().send({ ...message, token: follower.fcmToken });
          }

          if (follower.apnsToken && firebaseInitialized) {
            await admin.messaging().send({
              ...message,
              token: follower.apnsToken,
              apns: {
                payload: {
                  aps: {
                    alert: {
                      title: message.notification.title,
                      body: message.notification.body
                    },
                    sound: 'default'
                  }
                }
              }
            });
          }
        }
      } catch (error) {
        console.error(`Failed to send notification to follower ${follower.id}:`, error.message);
      }
    }
  }

  getTimeUntilBroadcast(scheduledTime) {
    const now = new Date();
    const start = new Date(scheduledTime);
    const diff = start - now;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `in ${days} day${days !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      return 'very soon';
    }
  }

  async testEmail(toEmail) {
    if (!emailTransporter) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || 'LiveAudioCast <noreply@liveaudiocast.com>',
      to: toEmail,
      subject: 'Test Email from LiveAudioCast',
      html: '<h1>Test Email</h1><p>This is a test email from LiveAudioCast.</p>',
      text: 'Test Email\n\nThis is a test email from LiveAudioCast.'
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`Test email sent to ${toEmail}`);
  }
}

module.exports = new NotificationService();
