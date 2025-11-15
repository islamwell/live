module.exports = (sequelize, DataTypes) => {
  const Follow = sequelize.define('Follow', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    followerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    followingId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    tableName: 'follows',
    indexes: [
      { fields: ['followerId'] },
      { fields: ['followingId'] },
      {
        unique: true,
        fields: ['followerId', 'followingId'],
        name: 'unique_follow'
      }
    ]
  });

  Follow.associate = (models) => {
    // Associations are defined in User model
  };

  return Follow;
};
