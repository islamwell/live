#!/usr/bin/env node

const io = require('socket.io-client');
const axios = require('axios');
const chalk = require('chalk');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('listeners', {
    alias: 'l',
    type: 'number',
    description: 'Number of concurrent listeners',
    default: 50
  })
  .option('duration', {
    alias: 'd',
    type: 'number',
    description: 'Test duration in seconds',
    default: 300
  })
  .option('broadcast-id', {
    alias: 'b',
    type: 'string',
    description: 'Broadcast ID to join',
    required: true
  })
  .option('api-url', {
    alias: 'u',
    type: 'string',
    description: 'API base URL',
    default: 'http://localhost:4000'
  })
  .option('ramp-up', {
    alias: 'r',
    type: 'number',
    description: 'Ramp-up time in seconds',
    default: 30
  })
  .argv;

class LoadTester {
  constructor(config) {
    this.config = config;
    this.listeners = [];
    this.stats = {
      totalListeners: 0,
      activeListeners: 0,
      connectedListeners: 0,
      failedConnections: 0,
      messagesReceived: 0,
      reactionsReceived: 0,
      avgLatency: 0,
      latencies: [],
      startTime: Date.now()
    };
    this.isRunning = false;
  }

  async start() {
    console.log(chalk.blue.bold('\n🚀 LiveAudioCast Load Test'));
    console.log(chalk.gray('='.repeat(50)));
    console.log(chalk.white(`Listeners: ${this.config.listeners}`));
    console.log(chalk.white(`Duration: ${this.config.duration}s`));
    console.log(chalk.white(`Broadcast: ${this.config.broadcastId}`));
    console.log(chalk.white(`Ramp-up: ${this.config.rampUp}s`));
    console.log(chalk.gray('='.repeat(50)));

    this.isRunning = true;

    // Start stats reporter
    this.startStatsReporter();

    // Ramp up listeners
    await this.rampUpListeners();

    // Wait for test duration
    await this.wait(this.config.duration * 1000);

    // Cleanup
    await this.cleanup();

    // Print final report
    this.printFinalReport();
  }

  async rampUpListeners() {
    const delay = (this.config.rampUp * 1000) / this.config.listeners;

    for (let i = 0; i < this.config.listeners; i++) {
      if (!this.isRunning) break;

      await this.createListener(i);
      await this.wait(delay);
    }

    console.log(chalk.green(`\n✓ All ${this.config.listeners} listeners created`));
  }

  async createListener(id) {
    try {
      // Create test user and get token
      const { token, user } = await this.createTestUser(id);

      // Connect to WebSocket
      const socket = io(this.config.apiUrl, {
        auth: { token },
        transports: ['websocket']
      });

      const listener = {
        id,
        userId: user.id,
        socket,
        connected: false,
        joined: false,
        startTime: Date.now()
      };

      socket.on('connect', () => {
        listener.connected = true;
        this.stats.connectedListeners++;

        // Join broadcast
        socket.emit('join', { broadcastId: this.config.broadcastId });
      });

      socket.on('joined', (data) => {
        listener.joined = true;
        this.stats.activeListeners++;

        const latency = Date.now() - listener.startTime;
        this.stats.latencies.push(latency);
        this.updateAvgLatency();
      });

      socket.on('chatMessage', (data) => {
        this.stats.messagesReceived++;
      });

      socket.on('reaction', (data) => {
        this.stats.reactionsReceived++;
      });

      socket.on('error', (error) => {
        console.error(chalk.red(`Listener ${id} error:`), error);
      });

      socket.on('disconnect', () => {
        listener.connected = false;
        if (listener.joined) {
          this.stats.activeListeners--;
        }
      });

      socket.on('connect_error', (error) => {
        this.stats.failedConnections++;
        console.error(chalk.red(`Connection failed for listener ${id}:`), error.message);
      });

      this.listeners.push(listener);
      this.stats.totalListeners++;

    } catch (error) {
      this.stats.failedConnections++;
      console.error(chalk.red(`Failed to create listener ${id}:`), error.message);
    }
  }

  async createTestUser(id) {
    try {
      // Try to login first (in case user exists)
      const loginResponse = await axios.post(`${this.config.apiUrl}/api/auth/login`, {
        email: `test${id}@loadtest.com`,
        password: 'loadtest123'
      });

      return {
        token: loginResponse.data.accessToken,
        user: loginResponse.data.user
      };
    } catch (error) {
      // User doesn't exist, register
      const registerResponse = await axios.post(`${this.config.apiUrl}/api/auth/register`, {
        email: `test${id}@loadtest.com`,
        username: `loadtest${id}`,
        password: 'loadtest123',
        displayName: `Load Test User ${id}`
      });

      return {
        token: registerResponse.data.accessToken,
        user: registerResponse.data.user
      };
    }
  }

  updateAvgLatency() {
    if (this.stats.latencies.length === 0) return;

    const sum = this.stats.latencies.reduce((a, b) => a + b, 0);
    this.stats.avgLatency = Math.round(sum / this.stats.latencies.length);
  }

  startStatsReporter() {
    this.reportInterval = setInterval(() => {
      const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000);
      const connRate = Math.round((this.stats.connectedListeners / this.stats.totalListeners) * 100);

      console.clear();
      console.log(chalk.blue.bold('\n📊 Real-time Stats'));
      console.log(chalk.gray('='.repeat(50)));
      console.log(chalk.white(`Runtime: ${runtime}s / ${this.config.duration}s`));
      console.log(chalk.white(`Total Listeners: ${this.stats.totalListeners}`));
      console.log(chalk.green(`Connected: ${this.stats.connectedListeners} (${connRate}%)`));
      console.log(chalk.yellow(`Active in Broadcast: ${this.stats.activeListeners}`));
      console.log(chalk.red(`Failed: ${this.stats.failedConnections}`));
      console.log(chalk.white(`Avg Latency: ${this.stats.avgLatency}ms`));
      console.log(chalk.white(`Messages: ${this.stats.messagesReceived}`));
      console.log(chalk.white(`Reactions: ${this.stats.reactionsReceived}`));
      console.log(chalk.gray('='.repeat(50)));

      // Calculate percentiles
      if (this.stats.latencies.length > 0) {
        const sorted = [...this.stats.latencies].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];

        console.log(chalk.cyan('Latency Percentiles:'));
        console.log(chalk.white(`  P50: ${p50}ms`));
        console.log(chalk.white(`  P95: ${p95}ms`));
        console.log(chalk.white(`  P99: ${p99}ms`));
        console.log(chalk.gray('='.repeat(50)));
      }
    }, 2000);
  }

  async cleanup() {
    this.isRunning = false;

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }

    console.log(chalk.yellow('\n⏳ Disconnecting listeners...'));

    for (const listener of this.listeners) {
      if (listener.socket && listener.connected) {
        listener.socket.disconnect();
      }
    }

    await this.wait(2000);
  }

  printFinalReport() {
    const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const successRate = Math.round(((this.stats.totalListeners - this.stats.failedConnections) / this.stats.totalListeners) * 100);

    console.clear();
    console.log(chalk.blue.bold('\n📈 Final Test Report'));
    console.log(chalk.gray('='.repeat(50)));
    console.log(chalk.white(`Total Runtime: ${runtime}s`));
    console.log(chalk.white(`Target Listeners: ${this.config.listeners}`));
    console.log(chalk.white(`Created Listeners: ${this.stats.totalListeners}`));
    console.log(chalk.green(`Successful Connections: ${this.stats.connectedListeners}`));
    console.log(chalk.red(`Failed Connections: ${this.stats.failedConnections}`));
    console.log(chalk.yellow(`Success Rate: ${successRate}%`));
    console.log(chalk.gray('='.repeat(50)));

    if (this.stats.latencies.length > 0) {
      const sorted = [...this.stats.latencies].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      console.log(chalk.cyan('Latency Statistics:'));
      console.log(chalk.white(`  Min: ${min}ms`));
      console.log(chalk.white(`  Max: ${max}ms`));
      console.log(chalk.white(`  Avg: ${this.stats.avgLatency}ms`));
      console.log(chalk.white(`  P50: ${p50}ms`));
      console.log(chalk.white(`  P95: ${p95}ms`));
      console.log(chalk.white(`  P99: ${p99}ms`));
      console.log(chalk.gray('='.repeat(50)));
    }

    console.log(chalk.cyan('Message Statistics:'));
    console.log(chalk.white(`  Chat Messages: ${this.stats.messagesReceived}`));
    console.log(chalk.white(`  Reactions: ${this.stats.reactionsReceived}`));
    console.log(chalk.gray('='.repeat(50)));

    // Pass/Fail criteria
    const passedLatency = p95 < 500;
    const passedSuccess = successRate >= 95;

    console.log(chalk.bold('\nTest Results:'));
    console.log(passedLatency ? chalk.green('✓ Latency: PASS (P95 < 500ms)') : chalk.red('✗ Latency: FAIL (P95 >= 500ms)'));
    console.log(passedSuccess ? chalk.green('✓ Success Rate: PASS (>= 95%)') : chalk.red('✗ Success Rate: FAIL (< 95%)'));

    if (passedLatency && passedSuccess) {
      console.log(chalk.green.bold('\n✓ LOAD TEST PASSED\n'));
      process.exit(0);
    } else {
      console.log(chalk.red.bold('\n✗ LOAD TEST FAILED\n'));
      process.exit(1);
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run load test
const tester = new LoadTester({
  listeners: argv.listeners,
  duration: argv.duration,
  broadcastId: argv['broadcast-id'],
  apiUrl: argv['api-url'],
  rampUp: argv['ramp-up']
});

tester.start().catch(error => {
  console.error(chalk.red('Load test failed:'), error);
  process.exit(1);
});

// Handle interrupts
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\nReceived SIGINT, cleaning up...'));
  await tester.cleanup();
  tester.printFinalReport();
});
