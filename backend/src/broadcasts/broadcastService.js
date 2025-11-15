const { Broadcast, User, Recording, Reminder, Session, ChatMessage, Reaction } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

class BroadcastService {
  async createBroadcast(hostId, data) {
    const {
      title,
      description,
      scheduledStartTime,
      timezone,
      coverImage,
      maxListeners,
      isPublic,
      requiresApproval,
      chatEnabled,
      reactionsEnabled,
      raiseHandEnabled,
      isRecurring,
      recurrenceRule,
      reminderOffsets,
      tags,
      category
    } = data;

    // Generate invite code if private
    const inviteCode = !isPublic ? crypto.randomBytes(8).toString('hex') : null;

    // Create broadcast
    const broadcast = await Broadcast.create({
      title,
      description,
      hostId,
      scheduledStartTime,
      timezone,
      coverImage,
      maxListeners,
      isPublic,
      inviteCode,
      requiresApproval,
      chatEnabled,
      reactionsEnabled,
      raiseHandEnabled,
      isRecurring,
      recurrenceRule,
      tags,
      category,
      status: scheduledStartTime ? 'scheduled' : 'live'
    });

    // Create reminders if scheduled
    if (scheduledStartTime && reminderOffsets && reminderOffsets.length > 0) {
      await this.createReminders(broadcast.id, scheduledStartTime, reminderOffsets);
    }

    return broadcast;
  }

  async updateBroadcast(broadcastId, userId, userRole, data) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check permissions
    if (broadcast.hostId !== userId && userRole !== 'admin') {
      throw new Error('Unauthorized to update this broadcast');
    }

    // Don't allow updating if already ended
    if (broadcast.status === 'ended') {
      throw new Error('Cannot update ended broadcast');
    }

    await broadcast.update(data);
    return broadcast;
  }

  async deleteBroadcast(broadcastId, userId, userRole) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check permissions
    if (broadcast.hostId !== userId && userRole !== 'admin') {
      throw new Error('Unauthorized to delete this broadcast');
    }

    // Update status to cancelled instead of deleting
    if (broadcast.status === 'scheduled') {
      await broadcast.update({ status: 'cancelled' });
    } else if (broadcast.status === 'live') {
      throw new Error('Cannot delete live broadcast. End it first.');
    }

    return broadcast;
  }

  async getBroadcast(broadcastId, userId = null) {
    const broadcast = await Broadcast.findByPk(broadcastId, {
      include: [
        {
          model: User,
          as: 'host',
          attributes: ['id', 'username', 'displayName', 'avatar']
        },
        {
          model: Recording,
          as: 'recordings',
          where: { isPublic: true },
          required: false
        }
      ]
    });

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check if user has access to private broadcast
    if (!broadcast.isPublic && broadcast.hostId !== userId) {
      throw new Error('This broadcast is private');
    }

    return broadcast;
  }

  async listBroadcasts(filters = {}) {
    const { status, hostId, isPublic, limit = 50, offset = 0, search } = filters;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (hostId) {
      where.hostId = hostId;
    }

    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { rows: broadcasts, count } = await Broadcast.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'host',
          attributes: ['id', 'username', 'displayName', 'avatar']
        }
      ],
      limit,
      offset,
      order: [
        ['status', 'ASC'],
        ['scheduledStartTime', 'ASC'],
        ['createdAt', 'DESC']
      ]
    });

    return {
      broadcasts,
      total: count,
      limit,
      offset
    };
  }

  async startBroadcast(broadcastId, userId) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    if (broadcast.hostId !== userId) {
      throw new Error('Only the host can start the broadcast');
    }

    if (broadcast.status === 'live') {
      throw new Error('Broadcast is already live');
    }

    if (broadcast.status === 'ended') {
      throw new Error('Cannot restart ended broadcast');
    }

    await broadcast.update({
      status: 'live',
      actualStartTime: new Date(),
      currentListenerCount: 0
    });

    return broadcast;
  }

  async endBroadcast(broadcastId, userId, userRole) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    if (broadcast.hostId !== userId && userRole !== 'admin') {
      throw new Error('Unauthorized to end this broadcast');
    }

    if (broadcast.status !== 'live') {
      throw new Error('Broadcast is not live');
    }

    await broadcast.update({
      status: 'ended',
      endTime: new Date(),
      currentListenerCount: 0
    });

    // End all active sessions
    await Session.update(
      { status: 'disconnected', leftAt: new Date() },
      { where: { broadcastId, status: 'connected' } }
    );

    return broadcast;
  }

  async updateListenerCount(broadcastId, count) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    const updateData = { currentListenerCount: count };

    if (count > broadcast.peakListenerCount) {
      updateData.peakListenerCount = count;
    }

    await broadcast.update(updateData);
  }

  async createReminders(broadcastId, scheduledStartTime, offsetsInMinutes) {
    const reminders = [];
    const startTime = new Date(scheduledStartTime);

    for (const offset of offsetsInMinutes) {
      const scheduledTime = new Date(startTime.getTime() - offset * 60 * 1000);

      // Only create reminder if it's in the future
      if (scheduledTime > new Date()) {
        reminders.push({
          broadcastId,
          offsetMinutes: offset,
          scheduledTime,
          reminderType: 'both',
          status: 'pending'
        });
      }
    }

    if (reminders.length > 0) {
      await Reminder.bulkCreate(reminders);
    }

    return reminders;
  }

  async getUpcomingBroadcasts(userId = null, limit = 20) {
    const where = {
      status: 'scheduled',
      scheduledStartTime: {
        [Op.gte]: new Date()
      }
    };

    if (!userId) {
      where.isPublic = true;
    }

    const broadcasts = await Broadcast.findAll({
      where,
      include: [
        {
          model: User,
          as: 'host',
          attributes: ['id', 'username', 'displayName', 'avatar']
        }
      ],
      limit,
      order: [['scheduledStartTime', 'ASC']]
    });

    return broadcasts;
  }

  async getLiveBroadcasts(limit = 20) {
    const broadcasts = await Broadcast.findAll({
      where: {
        status: 'live',
        isPublic: true
      },
      include: [
        {
          model: User,
          as: 'host',
          attributes: ['id', 'username', 'displayName', 'avatar']
        }
      ],
      limit,
      order: [['currentListenerCount', 'DESC'], ['actualStartTime', 'DESC']]
    });

    return broadcasts;
  }

  async getPastBroadcasts(hostId = null, limit = 20, offset = 0) {
    const where = {
      status: 'ended'
    };

    if (hostId) {
      where.hostId = hostId;
    }

    const { rows: broadcasts, count } = await Broadcast.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'host',
          attributes: ['id', 'username', 'displayName', 'avatar']
        },
        {
          model: Recording,
          as: 'recordings',
          where: { isPublic: true },
          required: false
        }
      ],
      limit,
      offset,
      order: [['endTime', 'DESC']]
    });

    return {
      broadcasts,
      total: count,
      limit,
      offset
    };
  }

  async getBroadcastStats(broadcastId) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    const [totalSessions, totalMessages, totalReactions] = await Promise.all([
      Session.count({ where: { broadcastId } }),
      ChatMessage.count({ where: { broadcastId, isDeleted: false } }),
      Reaction.count({ where: { broadcastId } })
    ]);

    const duration = broadcast.actualStartTime && broadcast.endTime
      ? Math.floor((broadcast.endTime - broadcast.actualStartTime) / 1000)
      : null;

    return {
      broadcastId,
      status: broadcast.status,
      currentListeners: broadcast.currentListenerCount,
      peakListeners: broadcast.peakListenerCount,
      totalSessions,
      totalMessages,
      totalReactions,
      duration,
      actualStartTime: broadcast.actualStartTime,
      endTime: broadcast.endTime
    };
  }
}

module.exports = new BroadcastService();
