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
const TEMP_RECORDING_DIR = process.env.TEMP_RECORDING_DIR || path.join(__dirname, '../../temp/recordings');
const CHUNK_FLUSH_INTERVAL = 5000; // Flush chunks to disk every 5 seconds
const CHUNK_BUFFER_SIZE = 100; // Flush after 100 chunks

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // broadcastId -> recording info
    this.chunkFlushIntervals = new Map(); // broadcastId -> interval timer

    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_RECORDING_DIR)) {
      fs.mkdirSync(TEMP_RECORDING_DIR, { recursive: true });
    }

    // Recover incomplete recordings on startup
    this.recoverIncompleteRecordings();
  }

  async recoverIncompleteRecordings() {
    try {
      // Find recordings that were in progress when server stopped
      const incompleteRecordings = await Recording.findAll({
        where: {
          status: 'recording'
        }
      });

      for (const recording of incompleteRecordings) {
        console.log(`Marking incomplete recording ${recording.id} as failed`);
        await recording.update({
          status: 'failed',
          metadata: {
            error: 'Server restart during recording',
            recoveredAt: new Date()
          }
        });

        // Clean up temp file if exists
        const tempFilePath = path.join(TEMP_RECORDING_DIR, `${recording.id}.webm`);
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`Cleaned up temp file for recording ${recording.id}`);
        }
      }

      // Also update broadcasts that were marked as recording
      await Broadcast.update(
        { isRecording: false },
        { where: { isRecording: true } }
      );

      console.log(`Recovered ${incompleteRecordings.length} incomplete recordings`);
    } catch (error) {
      console.error('Error recovering incomplete recordings:', error);
    }
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

    // Create temp file path for this recording
    const tempFilePath = path.join(TEMP_RECORDING_DIR, `${recording.id}.webm`);

    // Create write stream for temp file
    const writeStream = fs.createWriteStream(tempFilePath);

    // Store in active recordings
    this.activeRecordings.set(broadcastId, {
      recordingId: recording.id,
      fileName,
      s3Key,
      chunks: [],
      tempFilePath,
      writeStream,
      startedAt: new Date()
    });

    // Set up periodic chunk flushing
    const flushInterval = setInterval(() => {
      this.flushChunks(broadcastId);
    }, CHUNK_FLUSH_INTERVAL);

    this.chunkFlushIntervals.set(broadcastId, flushInterval);

    console.log(`Recording started for broadcast ${broadcastId}, temp file: ${tempFilePath}`);

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

    // Stop flush interval
    const flushInterval = this.chunkFlushIntervals.get(broadcastId);
    if (flushInterval) {
      clearInterval(flushInterval);
      this.chunkFlushIntervals.delete(broadcastId);
    }

    // Flush any remaining chunks
    await this.flushChunks(broadcastId);

    // Close write stream
    if (recordingInfo.writeStream) {
      await new Promise((resolve) => {
        recordingInfo.writeStream.end(resolve);
      });
    }

    // Calculate duration
    const duration = Math.floor((new Date() - recordingInfo.startedAt) / 1000);

    // Process recording asynchronously
    this.processRecording(recordingInfo.recordingId, duration, recordingInfo.tempFilePath).catch(error => {
      console.error('Error processing recording:', error);
    });

    // Remove from active recordings
    this.activeRecordings.delete(broadcastId);

    console.log(`Recording stopped for broadcast ${broadcastId}`);

    return recording;
  }

  async processRecording(recordingId, duration, tempFilePath) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      console.log(`Processing recording ${recordingId}...`);

      // Check if temp file exists
      if (!fs.existsSync(tempFilePath)) {
        throw new Error(`Temp file not found: ${tempFilePath}`);
      }

      // Get file size
      const stats = fs.statSync(tempFilePath);
      const fileSize = stats.size;

      if (fileSize === 0) {
        throw new Error('Recording file is empty');
      }

      console.log(`Uploading recording ${recordingId} to S3 (${fileSize} bytes)...`);

      // Upload to S3
      await this.uploadToS3(recording.s3Key, tempFilePath);

      console.log(`Recording ${recordingId} uploaded to S3 successfully`);

      // Generate signed URL for download (valid for 7 days)
      const downloadUrl = await this.getSignedDownloadUrl(recording.s3Key, 7 * 24 * 60 * 60);

      // Update recording
      await recording.update({
        status: 'completed',
        duration,
        downloadUrl,
        fileSize
      });

      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      console.log(`Temp file deleted: ${tempFilePath}`);

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

      // Clean up temp file on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`Cleaned up temp file after error: ${tempFilePath}`);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
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

  // Flush chunks from memory buffer to disk
  async flushChunks(broadcastId) {
    const recordingInfo = this.activeRecordings.get(broadcastId);

    if (!recordingInfo || recordingInfo.chunks.length === 0) {
      return;
    }

    try {
      const { writeStream, chunks } = recordingInfo;

      // Write all buffered chunks to file
      for (const chunk of chunks) {
        writeStream.write(chunk);
      }

      console.log(`Flushed ${chunks.length} chunks to disk for broadcast ${broadcastId}`);

      // Clear the buffer
      recordingInfo.chunks = [];
    } catch (error) {
      console.error(`Error flushing chunks for broadcast ${broadcastId}:`, error);
    }
  }

  // Method to receive audio chunks (would be called from mediasoup)
  addAudioChunk(broadcastId, chunk) {
    const recordingInfo = this.activeRecordings.get(broadcastId);

    if (recordingInfo) {
      recordingInfo.chunks.push(chunk);

      // Flush immediately if buffer is full
      if (recordingInfo.chunks.length >= CHUNK_BUFFER_SIZE) {
        this.flushChunks(broadcastId);
      }
    }
  }

  // Clean up all active recordings on shutdown
  async cleanup() {
    console.log('Cleaning up recording service...');

    // Stop all flush intervals
    for (const [broadcastId, interval] of this.chunkFlushIntervals.entries()) {
      clearInterval(interval);
      console.log(`Stopped flush interval for broadcast ${broadcastId}`);
    }
    this.chunkFlushIntervals.clear();

    // Flush and close all active recordings
    for (const [broadcastId, recordingInfo] of this.activeRecordings.entries()) {
      try {
        // Flush remaining chunks
        await this.flushChunks(broadcastId);

        // Close write stream
        if (recordingInfo.writeStream) {
          await new Promise((resolve) => {
            recordingInfo.writeStream.end(resolve);
          });
        }

        // Update recording status to failed (interrupted)
        await Recording.update(
          {
            status: 'failed',
            metadata: { error: 'Server shutdown during recording' }
          },
          { where: { id: recordingInfo.recordingId } }
        );

        console.log(`Closed recording for broadcast ${broadcastId}`);
      } catch (error) {
        console.error(`Error cleaning up recording for broadcast ${broadcastId}:`, error);
      }
    }

    this.activeRecordings.clear();
    console.log('Recording service cleanup complete');
  }
}

module.exports = new RecordingService();
