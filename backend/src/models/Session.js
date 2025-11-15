module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define('Session', {
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
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    role: {
      type: DataTypes.ENUM('host', 'speaker', 'listener'),
      defaultValue: 'listener',
      allowNull: false
    },
    socketId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    transportId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'MediaSoup transport ID'
    },
    producerId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'MediaSoup producer ID for speakers'
    },
    consumerIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'MediaSoup consumer IDs'
    },
    status: {
      type: DataTypes.ENUM('connected', 'disconnected', 'reconnecting'),
      defaultValue: 'connected'
    },
    isMuted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isHandRaised: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    handRaisedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userAgent: {
      type: DataTypes.STRING,
      allowNull: true
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Quality metrics
    audioPacketsLost: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    reconnectCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    timestamps: true,
    tableName: 'sessions',
    indexes: [
      { fields: ['broadcastId'] },
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['socketId'] }
    ]
  });

  Session.associate = (models) => {
    Session.belongsTo(models.Broadcast, {
      foreignKey: 'broadcastId',
      as: 'broadcast'
    });
    Session.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Session;
};
