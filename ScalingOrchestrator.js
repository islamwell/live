/**
 * ScalingOrchestrator.js - Manages automatic scaling, load balancing, and CDN orchestration
 * This is critical for scaling from 50 to 1000+ listeners
 */

const EventEmitter = require('events');
const Redis = require('ioredis');
const AWS = require('aws-sdk');
const k8s = require('@kubernetes/client-node');
const axios = require('axios');

class ScalingOrchestrator extends EventEmitter {
  constructor(config) {
    super();
    
    this.config = {
      scaling: {
        minInstances: 1,
        maxInstances: 10,
        targetCPU: 70,
        targetMemory: 80,
        targetListenersPerInstance: 50,
        scaleUpThreshold: 80,
        scaleDownThreshold: 30,
        cooldownPeriod: 300000, // 5 minutes
        cdnSwitchThreshold: 40,
        relayActivationThreshold: 200
      },
      cdn: {
        provider: config.cdnProvider || 'cloudfront',
        domain: config.cdnDomain,
        origins: config.cdnOrigins || [],
        behaviors: {
          hls: {
            ttl: 2,
            compress: true,
            allowedMethods: ['GET', 'HEAD', 'OPTIONS']
          },
          static: {
            ttl: 86400,
            compress: true
          }
        }
      },
      healthCheck: {
        interval: 10000,
        timeout: 5000,
        unhealthyThreshold: 3,
        healthyThreshold: 2
      },
      regions: config.regions || ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
      ...config
    };
    
    this.redis = new Redis.Cluster(config.redisNodes);
    this.pubsub = new Redis.Cluster(config.redisNodes);
    
    // AWS clients
    this.ec2 = new AWS.EC2({ region: config.awsRegion });
    this.autoscaling = new AWS.AutoScaling({ region: config.awsRegion });
    this.cloudfront = new AWS.CloudFront({ region: config.awsRegion });
    this.ecs = new AWS.ECS({ region: config.awsRegion });
    this.cloudwatch = new AWS.CloudWatch({ region: config.awsRegion });
    
    // Kubernetes client (optional)
    if (config.useKubernetes) {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      this.k8sApi = kc.makeApiClient(k8s.AppsV1Api);
      this.k8sMetrics = kc.makeApiClient(k8s.MetricsV1beta1Api);
    }
    
    // State tracking
    this.instances = new Map();
    this.relayNodes = new Map();
    this.cdnDistributions = new Map();
    this.metrics = new Map();
    this.scalingHistory = [];
    this.lastScaleAction = 0;
    
    this.initialize();
  }

  async initialize() {
    // Subscribe to Redis events
    this.pubsub.on('message', (channel, message) => {
      this.handleRedisMessage(channel, JSON.parse(message));
    });
    
    await this.pubsub.subscribe(
      'orchestrator:metrics',
      'orchestrator:scaling',
      'orchestrator:health',
      'media:scaling'
    );
    
    // Start monitoring loops
    this.startHealthChecking();
    this.startMetricsCollection();
    this.startAutoScaling();
    this.startCostOptimization();
    
    // Initialize CDN distributions
    await this.initializeCDN();
    
    console.log('ScalingOrchestrator initialized');
  }

  async handleRedisMessage(channel, data) {
    switch (channel) {
      case 'orchestrator:metrics':
        await this.processMetrics(data);
        break;
      case 'orchestrator:scaling':
        await this.handleScalingRequest(data);
        break;
      case 'orchestrator:health':
        await this.handleHealthUpdate(data);
        break;
      case 'media:scaling':
        await this.handleMediaScalingEvent(data);
        break;
    }
  }

  async processMetrics(data) {
    const { instanceId, metrics } = data;
    
    // Store metrics
    this.metrics.set(instanceId, {
      ...metrics,
      timestamp: Date.now()
    });
    
    // Push to CloudWatch
    await this.pushMetricsToCloudWatch(instanceId, metrics);
    
    // Check for anomalies
    if (metrics.cpu > 90 || metrics.memory > 90) {
      await this.handleHighLoad(instanceId, metrics);
    }
    
    if (metrics.errorRate > 0.05) {
      await this.handleHighErrorRate(instanceId, metrics);
    }
  }

  async handleScalingRequest(request) {
    const { type, broadcastId, currentLoad, targetLoad } = request;
    
    switch (type) {
      case 'scale-up':
        await this.scaleUp(broadcastId, targetLoad);
        break;
      case 'scale-down':
        await this.scaleDown(broadcastId);
        break;
      case 'add-relay':
        await this.addRelayNode(broadcastId, currentLoad);
        break;
      case 'activate-cdn':
        await this.activateCDN(broadcastId);
        break;
    }
  }

  async scaleUp(broadcastId, targetLoad) {
    // Check cooldown
    if (Date.now() - this.lastScaleAction < this.config.scaling.cooldownPeriod) {
      console.log('Scaling cooldown in effect');
      return;
    }
    
    console.log(`Scaling up for broadcast ${broadcastId}, target load: ${targetLoad}`);
    
    // Determine how many instances we need
    const currentInstances = this.instances.size;
    const instancesNeeded = Math.ceil(targetLoad / this.config.scaling.targetListenersPerInstance);
    const instancesToAdd = Math.min(
      instancesNeeded - currentInstances,
      this.config.scaling.maxInstances - currentInstances
    );
    
    if (instancesToAdd <= 0) {
      console.log('Already at max capacity');
      return;
    }
    
    // Launch new instances
    if (this.config.useKubernetes) {
      await this.scaleKubernetesDeployment(instancesToAdd);
    } else {
      await this.scaleECSService(instancesToAdd);
    }
    
    this.lastScaleAction = Date.now();
    
    // Record scaling event
    this.scalingHistory.push({
      type: 'scale-up',
      timestamp: Date.now(),
      instances: instancesToAdd,
      broadcastId,
      targetLoad
    });
    
    // Emit event
    this.emit('scaled', {
      type: 'up',
      instances: instancesToAdd,
      total: currentInstances + instancesToAdd
    });
  }

  async scaleDown(broadcastId) {
    // Check cooldown
    if (Date.now() - this.lastScaleAction < this.config.scaling.cooldownPeriod) {
      console.log('Scaling cooldown in effect');
      return;
    }
    
    console.log(`Scaling down for broadcast ${broadcastId}`);
    
    // Calculate instances to remove
    const currentInstances = this.instances.size;
    const totalLoad = Array.from(this.metrics.values())
      .reduce((sum, m) => sum + m.listenerCount, 0);
    
    const instancesNeeded = Math.ceil(totalLoad / this.config.scaling.targetListenersPerInstance);
    const instancesToRemove = Math.max(
      currentInstances - instancesNeeded,
      currentInstances - this.config.scaling.minInstances
    );
    
    if (instancesToRemove <= 0) {
      console.log('Already at minimum capacity');
      return;
    }
    
    // Select instances to terminate (least loaded first)
    const instancesToTerminate = Array.from(this.instances.entries())
      .sort((a, b) => {
        const aMetrics = this.metrics.get(a[0]);
        const bMetrics = this.metrics.get(b[0]);
        return (aMetrics?.listenerCount || 0) - (bMetrics?.listenerCount || 0);
      })
      .slice(0, instancesToRemove)
      .map(([id]) => id);
    
    // Drain connections first
    await this.drainInstances(instancesToTerminate);
    
    // Terminate instances
    if (this.config.useKubernetes) {
      await this.scaleKubernetesDeployment(-instancesToRemove);
    } else {
      await this.terminateECSInstances(instancesToTerminate);
    }
    
    this.lastScaleAction = Date.now();
    
    // Record scaling event
    this.scalingHistory.push({
      type: 'scale-down',
      timestamp: Date.now(),
      instances: instancesToRemove,
      broadcastId
    });
  }

  async addRelayNode(broadcastId, currentLoad) {
    console.log(`Adding relay node for broadcast ${broadcastId}, load: ${currentLoad}`);
    
    // Select best region based on listener distribution
    const listenerRegions = await this.getListenerRegionDistribution(broadcastId);
    const targetRegion = this.selectOptimalRegion(listenerRegions);
    
    // Launch relay instance
    const relayConfig = {
      region: targetRegion,
      instanceType: this.selectInstanceType(currentLoad),
      broadcastId,
      upstream: await this.getUpstreamServer(broadcastId)
    };
    
    const relayInstance = await this.launchRelayInstance(relayConfig);
    
    // Configure relay
    await this.configureRelay(relayInstance, broadcastId);
    
    // Register relay
    this.relayNodes.set(relayInstance.id, {
      ...relayInstance,
      broadcastId,
      region: targetRegion,
      createdAt: Date.now(),
      listenerCount: 0
    });
    
    // Update routing
    await this.updateRoutingRules(broadcastId, relayInstance);
    
    // Notify media servers
    await this.pubsub.publish('media:relay', JSON.stringify({
      type: 'relay:added',
      broadcastId,
      relay: {
        id: relayInstance.id,
        endpoint: relayInstance.endpoint,
        region: targetRegion
      }
    }));
    
    return relayInstance;
  }

  async activateCDN(broadcastId) {
    console.log(`Activating CDN for broadcast ${broadcastId}`);
    
    // Get or create CDN distribution
    let distribution = this.cdnDistributions.get(broadcastId);
    
    if (!distribution) {
      distribution = await this.createCDNDistribution(broadcastId);
      this.cdnDistributions.set(broadcastId, distribution);
    }
    
    // Configure origin
    const origin = await this.getMediaServerOrigin(broadcastId);
    await this.updateCDNOrigin(distribution.id, origin);
    
    // Enable HLS packaging
    await this.enableHLSPackaging(broadcastId, distribution);
    
    // Update DNS
    await this.updateDNSForCDN(broadcastId, distribution.domain);
    
    // Notify media servers to start HLS output
    await this.pubsub.publish('media:scaling', JSON.stringify({
      type: 'cdn:activated',
      broadcastId,
      cdnEndpoint: distribution.domain,
      hlsUrl: `https://${distribution.domain}/${broadcastId}/index.m3u8`
    }));
    
    return distribution;
  }

  async launchRelayInstance(config) {
    const { region, instanceType, broadcastId, upstream } = config;
    
    if (this.config.useKubernetes) {
      // Create Kubernetes pod
      const pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: `relay-${broadcastId}-${Date.now()}`,
          labels: {
            app: 'media-relay',
            broadcast: broadcastId,
            region
          }
        },
        spec: {
          containers: [{
            name: 'relay',
            image: 'your-registry/media-relay:latest',
            env: [
              { name: 'UPSTREAM', value: upstream },
              { name: 'BROADCAST_ID', value: broadcastId },
              { name: 'REDIS_NODES', value: this.config.redisNodes.join(',') }
            ],
            resources: {
              requests: {
                memory: '2Gi',
                cpu: '1000m'
              },
              limits: {
                memory: '4Gi',
                cpu: '2000m'
              }
            }
          }],
          nodeSelector: {
            'topology.kubernetes.io/region': region
          }
        }
      };
      
      const response = await this.k8sApi.createNamespacedPod('default', pod);
      
      // Wait for pod to be ready
      await this.waitForPodReady(response.body.metadata.name);
      
      // Get pod IP
      const podInfo = await this.k8sApi.readNamespacedPod(response.body.metadata.name, 'default');
      
      return {
        id: response.body.metadata.uid,
        name: response.body.metadata.name,
        endpoint: podInfo.body.status.podIP,
        region
      };
    } else {
      // Launch ECS task
      const taskDefinition = {
        family: 'media-relay',
        taskRoleArn: this.config.taskRoleArn,
        executionRoleArn: this.config.executionRoleArn,
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
        cpu: '2048',
        memory: '4096',
        containerDefinitions: [{
          name: 'relay',
          image: 'your-registry/media-relay:latest',
          environment: [
            { name: 'UPSTREAM', value: upstream },
            { name: 'BROADCAST_ID', value: broadcastId },
            { name: 'REDIS_NODES', value: this.config.redisNodes.join(',') }
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': '/ecs/media-relay',
              'awslogs-region': region,
              'awslogs-stream-prefix': 'relay'
            }
          }
        }]
      };
      
      // Register task definition
      const taskDefResponse = await this.ecs.registerTaskDefinition(taskDefinition).promise();
      
      // Run task
      const runTaskResponse = await this.ecs.runTask({
        taskDefinition: taskDefResponse.taskDefinition.taskDefinitionArn,
        cluster: this.config.ecsCluster,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: this.config.subnets[region],
            securityGroups: [this.config.securityGroup],
            assignPublicIp: 'ENABLED'
          }
        }
      }).promise();
      
      const task = runTaskResponse.tasks[0];
      
      // Wait for task to be running
      await this.waitForTaskRunning(task.taskArn);
      
      // Get task details
      const taskDetails = await this.ecs.describeTasks({
        cluster: this.config.ecsCluster,
        tasks: [task.taskArn]
      }).promise();
      
      const publicIp = taskDetails.tasks[0].attachments[0]
        .details.find(d => d.name === 'publicIPv4Address').value;
      
      return {
        id: task.taskArn,
        endpoint: publicIp,
        region
      };
    }
  }

  async createCDNDistribution(broadcastId) {
    const distributionConfig = {
      CallerReference: `broadcast-${broadcastId}-${Date.now()}`,
      Comment: `CDN for broadcast ${broadcastId}`,
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [{
          Id: `origin-${broadcastId}`,
          DomainName: 'origin-placeholder.example.com', // Will be updated
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: 'https-only',
            OriginSslProtocols: {
              Quantity: 3,
              Items: ['TLSv1', 'TLSv1.1', 'TLSv1.2']
            },
            OriginReadTimeout: 30,
            OriginKeepaliveTimeout: 5
          }
        }]
      },
      DefaultCacheBehavior: {
        TargetOriginId: `origin-${broadcastId}`,
        ViewerProtocolPolicy: 'redirect-to-https',
        TrustedSigners: {
          Enabled: false,
          Quantity: 0
        },
        ForwardedValues: {
          QueryString: true,
          Cookies: { Forward: 'none' },
          Headers: {
            Quantity: 3,
            Items: ['Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers']
          }
        },
        MinTTL: 0,
        DefaultTTL: 2,
        MaxTTL: 10,
        Compress: true
      },
      CacheBehaviors: {
        Quantity: 2,
        Items: [
          {
            PathPattern: '*.m3u8',
            TargetOriginId: `origin-${broadcastId}`,
            ViewerProtocolPolicy: 'redirect-to-https',
            TrustedSigners: { Enabled: false, Quantity: 0 },
            ForwardedValues: {
              QueryString: false,
              Cookies: { Forward: 'none' }
            },
            MinTTL: 0,
            DefaultTTL: 1,
            MaxTTL: 2,
            Compress: true
          },
          {
            PathPattern: '*.ts',
            TargetOriginId: `origin-${broadcastId}`,
            ViewerProtocolPolicy: 'redirect-to-https',
            TrustedSigners: { Enabled: false, Quantity: 0 },
            ForwardedValues: {
              QueryString: false,
              Cookies: { Forward: 'none' }
            },
            MinTTL: 0,
            DefaultTTL: 86400,
            MaxTTL: 31536000,
            Compress: true
          }
        ]
      }
    };
    
    const response = await this.cloudfront.createDistribution({
      DistributionConfig: distributionConfig
    }).promise();
    
    return {
      id: response.Distribution.Id,
      domain: response.Distribution.DomainName,
      status: response.Distribution.Status,
      createdAt: Date.now()
    };
  }

  async drainInstances(instanceIds) {
    console.log(`Draining ${instanceIds.length} instances`);
    
    // Mark instances as draining
    for (const instanceId of instanceIds) {
      await this.redis.hset(`instance:${instanceId}`, 'state', 'draining');
      
      // Notify instance to stop accepting new connections
      await this.pubsub.publish('orchestrator:control', JSON.stringify({
        type: 'drain',
        instanceId
      }));
    }
    
    // Wait for connections to drain
    const maxDrainTime = 60000; // 1 minute
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxDrainTime) {
      let allDrained = true;
      
      for (const instanceId of instanceIds) {
        const metrics = this.metrics.get(instanceId);
        if (metrics && metrics.listenerCount > 0) {
          allDrained = false;
          break;
        }
      }
      
      if (allDrained) {
        console.log('All instances drained successfully');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log('Drain timeout reached, proceeding with termination');
  }

  async getListenerRegionDistribution(broadcastId) {
    const listeners = await this.redis.hgetall(`presence:${broadcastId}`);
    const distribution = {};
    
    for (const [userId, data] of Object.entries(listeners)) {
      const listener = JSON.parse(data);
      const region = listener.region || 'unknown';
      distribution[region] = (distribution[region] || 0) + 1;
    }
    
    return distribution;
  }

  selectOptimalRegion(distribution) {
    // Select region with most listeners
    let maxListeners = 0;
    let optimalRegion = this.config.regions[0];
    
    for (const [region, count] of Object.entries(distribution)) {
      if (count > maxListeners && this.config.regions.includes(region)) {
        maxListeners = count;
        optimalRegion = region;
      }
    }
    
    return optimalRegion;
  }

  selectInstanceType(load) {
    if (load < 100) return 't3.medium';
    if (load < 500) return 't3.large';
    if (load < 1000) return 't3.xlarge';
    return 't3.2xlarge';
  }

  async pushMetricsToCloudWatch(instanceId, metrics) {
    const params = {
      Namespace: 'MediaStreaming',
      MetricData: [
        {
          MetricName: 'CPU',
          Value: metrics.cpu,
          Unit: 'Percent',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
        },
        {
          MetricName: 'Memory',
          Value: metrics.memory,
          Unit: 'Percent',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
        },
        {
          MetricName: 'ListenerCount',
          Value: metrics.listenerCount,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
        },
        {
          MetricName: 'Bandwidth',
          Value: metrics.bandwidth,
          Unit: 'Bytes',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }]
        }
      ]
    };
    
    await this.cloudwatch.putMetricData(params).promise();
  }

  startHealthChecking() {
    setInterval(async () => {
      for (const [instanceId, instance] of this.instances) {
        try {
          const healthy = await this.checkInstanceHealth(instance);
          
          if (!healthy) {
            instance.unhealthyCount = (instance.unhealthyCount || 0) + 1;
            
            if (instance.unhealthyCount >= this.config.healthCheck.unhealthyThreshold) {
              await this.handleUnhealthyInstance(instanceId);
            }
          } else {
            instance.unhealthyCount = 0;
          }
        } catch (error) {
          console.error(`Health check failed for ${instanceId}:`, error);
        }
      }
    }, this.config.healthCheck.interval);
  }

  async checkInstanceHealth(instance) {
    try {
      const response = await axios.get(`http://${instance.endpoint}/health`, {
        timeout: this.config.healthCheck.timeout
      });
      
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async handleUnhealthyInstance(instanceId) {
    console.error(`Instance ${instanceId} is unhealthy`);
    
    // Remove from load balancer
    await this.removeFromLoadBalancer(instanceId);
    
    // Drain connections
    await this.drainInstances([instanceId]);
    
    // Replace instance
    await this.replaceInstance(instanceId);
    
    // Alert
    this.emit('instance:unhealthy', { instanceId });
  }

  startMetricsCollection() {
    setInterval(async () => {
      const aggregated = {
        totalInstances: this.instances.size,
        totalRelays: this.relayNodes.size,
        totalListeners: 0,
        totalBandwidth: 0,
        averageCPU: 0,
        averageMemory: 0
      };
      
      let cpuSum = 0;
      let memorySum = 0;
      
      for (const metrics of this.metrics.values()) {
        aggregated.totalListeners += metrics.listenerCount || 0;
        aggregated.totalBandwidth += metrics.bandwidth || 0;
        cpuSum += metrics.cpu || 0;
        memorySum += metrics.memory || 0;
      }
      
      if (this.metrics.size > 0) {
        aggregated.averageCPU = cpuSum / this.metrics.size;
        aggregated.averageMemory = memorySum / this.metrics.size;
      }
      
      // Store aggregated metrics
      await this.redis.hset('metrics:aggregated', 'latest', JSON.stringify(aggregated));
      await this.redis.xadd('metrics:history', '*', 'data', JSON.stringify(aggregated));
      
      // Emit metrics
      this.emit('metrics', aggregated);
    }, 30000);
  }

  startAutoScaling() {
    setInterval(async () => {
      const metrics = await this.getAggregatedMetrics();
      
      // Check if scaling is needed
      if (metrics.averageCPU > this.config.scaling.targetCPU || 
          metrics.averageMemory > this.config.scaling.targetMemory) {
        await this.scaleUp('auto', metrics.totalListeners * 1.5);
      } else if (metrics.averageCPU < this.config.scaling.scaleDownThreshold && 
                 metrics.averageMemory < this.config.scaling.scaleDownThreshold) {
        await this.scaleDown('auto');
      }
      
      // Check for CDN activation
      const broadcasts = await this.getActiveBroadcasts();
      
      for (const broadcast of broadcasts) {
        if (broadcast.listenerCount >= this.config.scaling.cdnSwitchThreshold && 
            !broadcast.cdnActivated) {
          await this.activateCDN(broadcast.id);
        }
        
        if (broadcast.listenerCount >= this.config.scaling.relayActivationThreshold && 
            !broadcast.relaysActivated) {
          await this.addRelayNode(broadcast.id, broadcast.listenerCount);
        }
      }
    }, 60000); // Every minute
  }

  startCostOptimization() {
    setInterval(async () => {
      // Analyze cost metrics
      const costAnalysis = await this.analyzeCosts();
      
      // Optimize instance types
      for (const [instanceId, metrics] of this.metrics) {
        const instance = this.instances.get(instanceId);
        if (!instance) continue;
        
        const optimalType = this.selectInstanceType(metrics.listenerCount);
        
        if (optimalType !== instance.type && this.canResizeInstance(instance)) {
          await this.resizeInstance(instanceId, optimalType);
        }
      }
      
      // Clean up unused CDN distributions
      for (const [broadcastId, distribution] of this.cdnDistributions) {
        const broadcast = await this.getBroadcast(broadcastId);
        
        if (!broadcast || Date.now() - distribution.lastUsed > 3600000) {
          await this.deleteCDNDistribution(distribution.id);
          this.cdnDistributions.delete(broadcastId);
        }
      }
      
      // Optimize relay placement
      await this.optimizeRelayPlacement();
      
      // Emit cost report
      this.emit('cost:analysis', costAnalysis);
    }, 300000); // Every 5 minutes
  }

  async analyzeCosts() {
    const costs = {
      instances: 0,
      bandwidth: 0,
      storage: 0,
      cdn: 0,
      total: 0
    };
    
    // Calculate instance costs
    for (const instance of this.instances.values()) {
      costs.instances += this.getInstanceCostPerHour(instance.type);
    }
    
    // Calculate bandwidth costs
    const totalBandwidth = Array.from(this.metrics.values())
      .reduce((sum, m) => sum + (m.bandwidth || 0), 0);
    costs.bandwidth = totalBandwidth * 0.09 / 1024 / 1024 / 1024; // $0.09 per GB
    
    // Calculate CDN costs
    costs.cdn = this.cdnDistributions.size * 0.085; // Rough estimate
    
    costs.total = costs.instances + costs.bandwidth + costs.storage + costs.cdn;
    
    return costs;
  }

  getInstanceCostPerHour(type) {
    const costs = {
      't3.micro': 0.0104,
      't3.small': 0.0208,
      't3.medium': 0.0416,
      't3.large': 0.0832,
      't3.xlarge': 0.1664,
      't3.2xlarge': 0.3328
    };
    
    return costs[type] || 0.0416;
  }

  async cleanup() {
    // Stop all intervals
    clearInterval(this.healthCheckInterval);
    clearInterval(this.metricsInterval);
    clearInterval(this.autoScalingInterval);
    clearInterval(this.costOptimizationInterval);
    
    // Clean up Redis
    await this.redis.quit();
    await this.pubsub.quit();
  }
}

module.exports = ScalingOrchestrator;
