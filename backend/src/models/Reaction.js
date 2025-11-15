module.exports = (sequelize, DataTypes) => {
  const Reaction = sequelize.define('Reaction', {
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
    emoji: {
      type: DataTypes.STRING,
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    tableName: 'reactions',
    indexes: [
      { fields: ['broadcastId'] },
      { fields: ['userId'] },
      { fields: ['createdAt'] }
    ]
  });

  Reaction.associate = (models) => {
    Reaction.belongsTo(models.Broadcast, {
      foreignKey: 'broadcastId',
      as: 'broadcast'
    });
    Reaction.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Reaction;
};
