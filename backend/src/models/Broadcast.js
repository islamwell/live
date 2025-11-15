module.exports = (sequelize, DataTypes) => {
  const Broadcast = sequelize.define('Broadcast', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    hostId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'live', 'ended', 'cancelled'),
      defaultValue: 'scheduled',
      allowNull: false
    },
    scheduledStartTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    actualStartTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    timezone: {
      type: DataTypes.STRING,
      defaultValue: 'UTC'
    },
    coverImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isRecording: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    maxListeners: {
      type: DataTypes.INTEGER,
      defaultValue: 1000
    },
    currentListenerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    peakListenerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    inviteCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    requiresApproval: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    chatEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    reactionsEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    raiseHandEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    // Recurring broadcast settings
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    recurrenceRule: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'RRULE format: {freq: "WEEKLY", interval: 1, byweekday: ["MO","WE","FR"]}'
    },
    recurrenceEndDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    parentBroadcastId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'broadcasts',
        key: 'id'
      }
    },
    // Media settings
    useHLS: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    hlsUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mediasoupRouterId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Metadata
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'broadcasts',
    indexes: [
      { fields: ['hostId'] },
      { fields: ['status'] },
      { fields: ['scheduledStartTime'] },
      { fields: ['inviteCode'], unique: true, where: { inviteCode: { [sequelize.Sequelize.Op.ne]: null } } }
    ]
  });

  Broadcast.associate = (models) => {
    Broadcast.belongsTo(models.User, {
      foreignKey: 'hostId',
      as: 'host'
    });
    Broadcast.hasMany(models.Recording, {
      foreignKey: 'broadcastId',
      as: 'recordings'
    });
    Broadcast.hasMany(models.Reminder, {
      foreignKey: 'broadcastId',
      as: 'reminders'
    });
    Broadcast.hasMany(models.Session, {
      foreignKey: 'broadcastId',
      as: 'sessions'
    });
    Broadcast.hasMany(models.Reaction, {
      foreignKey: 'broadcastId',
      as: 'reactions'
    });
    Broadcast.hasMany(models.ChatMessage, {
      foreignKey: 'broadcastId',
      as: 'messages'
    });
    // Self-referencing for recurring broadcasts
    Broadcast.belongsTo(models.Broadcast, {
      foreignKey: 'parentBroadcastId',
      as: 'parentBroadcast'
    });
    Broadcast.hasMany(models.Broadcast, {
      foreignKey: 'parentBroadcastId',
      as: 'recurringInstances'
    });
  };

  return Broadcast;
};
