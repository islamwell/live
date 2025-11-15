module.exports = (sequelize, DataTypes) => {
  const Recording = sequelize.define('Recording', {
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
    fileName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Size in bytes'
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration in seconds'
    },
    s3Key: {
      type: DataTypes.STRING,
      allowNull: false
    },
    s3Bucket: {
      type: DataTypes.STRING,
      allowNull: false
    },
    downloadUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    format: {
      type: DataTypes.STRING,
      defaultValue: 'webm',
      allowNull: false
    },
    codec: {
      type: DataTypes.STRING,
      defaultValue: 'opus'
    },
    status: {
      type: DataTypes.ENUM('recording', 'processing', 'completed', 'failed'),
      defaultValue: 'recording'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    transcription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    timestamps: true,
    tableName: 'recordings',
    indexes: [
      { fields: ['broadcastId'] },
      { fields: ['status'] }
    ]
  });

  Recording.associate = (models) => {
    Recording.belongsTo(models.Broadcast, {
      foreignKey: 'broadcastId',
      as: 'broadcast'
    });
  };

  return Recording;
};
