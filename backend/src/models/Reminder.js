module.exports = (sequelize, DataTypes) => {
  const Reminder = sequelize.define('Reminder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    broadcastId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'broadcasts',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'If null, reminder is for all followers of the host'
    },
    reminderType: {
      type: DataTypes.ENUM('push', 'email', 'both'),
      defaultValue: 'both',
      allowNull: false
    },
    offsetMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Minutes before broadcast start time (e.g., 60 for 1 hour before)'
    },
    scheduledTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'reminders',
    indexes: [
      { fields: ['broadcastId'] },
      { fields: ['userId'] },
      { fields: ['scheduledTime'] },
      { fields: ['status'] }
    ]
  });

  Reminder.associate = (models) => {
    Reminder.belongsTo(models.Broadcast, {
      foreignKey: 'broadcastId',
      as: 'broadcast'
    });
    Reminder.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Reminder;
};
