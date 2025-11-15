const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Recording, Broadcast } = require('../models');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT })
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'liveaudiocast-recordings';

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // broadcastId -> recording info
  }

  async startRecording(broadcastId, userId) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    if (broadcast.hostId !== userId) {
      throw new Error('Only the host can start recording');
    }

    if (broadcast.status !== 'live') {
      throw new Error('Broadcast must be live to start recording');
    }

    // Check if already recording
    if (broadcast.isRecording) {
      throw new Error('Recording already in progress');
    }

    // Create recording record
    const fileName = `broadcast-${broadcastId}-${Date.now()}.webm`;
    const s3Key = `recordings/${broadcastId}/${fileName}`;

    const recording = await Recording.create({
      broadcastId,
      fileName,
      s3Key,
      s3Bucket: BUCKET_NAME,
      format: 'webm',
      codec: 'opus',
      status: 'recording',
      startedAt: new Date()
    });

    // Update broadcast
    await broadcast.update({ isRecording: true });

    // Store in active recordings
    this.activeRecordings.set(broadcastId, {
      recordingId: recording.id,
      fileName,
      s3Key,
      chunks: [],
      startedAt: new Date()
    });

    console.log(`Recording started for broadcast ${broadcastId}`);

    return recording;
  }

  async stopRecording(broadcastId, userId, userRole) {
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    if (broadcast.hostId !== userId && userRole !== 'admin') {
      throw new Error('Unauthorized to stop recording');
    }

    if (!broadcast.isRecording) {
      throw new Error('No recording in progress');
    }

    const recordingInfo = this.activeRecordings.get(broadcastId);

    if (!recordingInfo) {
      throw new Error('Recording info not found');
    }

    // Find recording record
    const recording = await Recording.findByPk(recordingInfo.recordingId);

    if (!recording) {
      throw new Error('Recording record not found');
    }

    // Update status
    await recording.update({
      status: 'processing',
      completedAt: new Date()
    });

    // Update broadcast
    await broadcast.update({ isRecording: false });

    // Calculate duration
    const duration = Math.floor((new Date() - recordingInfo.startedAt) / 1000);

    // Process recording asynchronously
    this.processRecording(recordingInfo.recordingId, duration).catch(error => {
      console.error('Error processing recording:', error);
    });

    // Remove from active recordings
    this.activeRecordings.delete(broadcastId);

    console.log(`Recording stopped for broadcast ${broadcastId}`);

    return recording;
  }

  async processRecording(recordingId, duration) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      // In a real implementation, you would:
      // 1. Combine audio chunks into a single file
      // 2. Convert/transcode if needed
      // 3. Upload to S3
      // 4. Generate signed URL for download
      // 5. Optionally generate transcription

      // For now, we'll simulate this
      console.log(`Processing recording ${recordingId}...`);

      // Simulate upload to S3
      // In production, this would upload the actual file
      // await this.uploadToS3(recording.s3Key, filePath);

      // Generate signed URL for download (valid for 7 days)
      const downloadUrl = await this.getSignedDownloadUrl(recording.s3Key, 7 * 24 * 60 * 60);

      // Update recording
      await recording.update({
        status: 'completed',
        duration,
        downloadUrl,
        fileSize: 0 // Would be actual file size
      });

      console.log(`Recording ${recordingId} processed successfully`);

      return recording;
    } catch (error) {
      console.error(`Error processing recording ${recordingId}:`, error);

      const recording = await Recording.findByPk(recordingId);
      if (recording) {
        await recording.update({
          status: 'failed',
          metadata: { error: error.message }
        });
      }

      throw error;
    }
  }

  async uploadToS3(s3Key, filePath) {
    try {
      const fileContent = fs.readFileSync(filePath);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'audio/webm'
      });

      await s3Client.send(command);

      console.log(`File uploaded to S3: ${s3Key}`);
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw error;
    }
  }

  async getSignedDownloadUrl(s3Key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });

      return url;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  async deleteRecording(recordingId, userId, userRole) {
    const recording = await Recording.findByPk(recordingId, {
      include: [
        {
          model: Broadcast,
          as: 'broadcast'
        }
      ]
    });

    if (!recording) {
      throw new Error('Recording not found');
    }

    // Check permissions
    if (recording.broadcast.hostId !== userId && userRole !== 'admin') {
      throw new Error('Unauthorized to delete this recording');
    }

    // Delete from S3
    try {
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: recording.s3Key
      });

      await s3Client.send(command);
    } catch (error) {
      console.error('Error deleting from S3:', error);
      // Continue even if S3 deletion fails
    }

    // Delete record
    await recording.destroy();

    console.log(`Recording ${recordingId} deleted`);

    return { message: 'Recording deleted successfully' };
  }

  async getRecording(recordingId) {
    const recording = await Recording.findByPk(recordingId, {
      include: [
        {
          model: Broadcast,
          as: 'broadcast'
        }
      ]
    });

    if (!recording) {
      throw new Error('Recording not found');
    }

    // Refresh download URL if expired or missing
    if (!recording.downloadUrl || this.isUrlExpired(recording.updatedAt)) {
      const downloadUrl = await this.getSignedDownloadUrl(recording.s3Key);
      await recording.update({ downloadUrl });
    }

    return recording;
  }

  async listRecordings(filters = {}) {
    const { broadcastId, isPublic, limit = 50, offset = 0 } = filters;

    const where = {};

    if (broadcastId) {
      where.broadcastId = broadcastId;
    }

    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    where.status = 'completed';

    const { rows: recordings, count } = await Recording.findAndCountAll({
      where,
      include: [
        {
          model: Broadcast,
          as: 'broadcast',
          attributes: ['id', 'title', 'hostId']
        }
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      recordings,
      total: count,
      limit,
      offset
    };
  }

  async updateRecordingVisibility(recordingId, isPublic, userId, userRole) {
    const recording = await Recording.findByPk(recordingId, {
      include: [
        {
          model: Broadcast,
          as: 'broadcast'
        }
      ]
    });

    if (!recording) {
      throw new Error('Recording not found');
    }

    // Check permissions
    if (recording.broadcast.hostId !== userId && userRole !== 'admin') {
      throw new Error('Unauthorized to update this recording');
    }

    await recording.update({ isPublic });

    return recording;
  }

  isUrlExpired(updatedAt, expiresIn = 6 * 24 * 60 * 60 * 1000) {
    // Check if URL is older than 6 days
    const now = new Date();
    const updated = new Date(updatedAt);
    return (now - updated) > expiresIn;
  }

  isRecording(broadcastId) {
    return this.activeRecordings.has(broadcastId);
  }

  getActiveRecordingInfo(broadcastId) {
    return this.activeRecordings.get(broadcastId);
  }

  // Method to receive audio chunks (would be called from mediasoup)
  addAudioChunk(broadcastId, chunk) {
    const recordingInfo = this.activeRecordings.get(broadcastId);

    if (recordingInfo) {
      recordingInfo.chunks.push(chunk);
    }
  }
}

module.exports = new RecordingService();
