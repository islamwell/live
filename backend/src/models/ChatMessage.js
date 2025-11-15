module.exports = (sequelize, DataTypes) => {
  const ChatMessage = sequelize.define('ChatMessage', {
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
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    messageType: {
      type: DataTypes.ENUM('text', 'system', 'pinned'),
      defaultValue: 'text'
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    replyToId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'chat_messages',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    tableName: 'chat_messages',
    indexes: [
      { fields: ['broadcastId'] },
      { fields: ['userId'] },
      { fields: ['createdAt'] },
      { fields: ['isPinned'] }
    ]
  });

  ChatMessage.associate = (models) => {
    ChatMessage.belongsTo(models.Broadcast, {
      foreignKey: 'broadcastId',
      as: 'broadcast'
    });
    ChatMessage.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
    ChatMessage.belongsTo(models.ChatMessage, {
      foreignKey: 'replyToId',
      as: 'replyTo'
    });
    ChatMessage.hasMany(models.ChatMessage, {
      foreignKey: 'replyToId',
      as: 'replies'
    });
  };

  return ChatMessage;
};
