# Scaling Runbook for LiveAudioCast

## Overview

This runbook provides step-by-step instructions for scaling LiveAudioCast from 50 concurrent listeners to 1000+ listeners while maintaining low latency and minimizing costs.

## Scaling Stages

### Stage 1: 0-50 Concurrent Listeners (Baseline)

**Infrastructure:**
- 1 backend instance (2 vCPU, 4GB RAM)
- 1 mediasoup worker
- 1 PostgreSQL instance
- 1 Redis instance

**Configuration:**
```env
MEDIASOUP_NUM_WORKERS=1
SCALING_ENABLED=false
HLS_ENABLED=false
```

**Monitoring Thresholds:**
- CPU < 60%
- Memory < 70%
- Latency < 300ms

**Action Required:** None, this is baseline deployment.

---

### Stage 2: 50-100 Concurrent Listeners

**Infrastructure Changes:**
- Increase to 2 backend instances
- Add mediasoup workers (2 workers per instance)
- Enable Redis clustering

**Steps:**

1. **Update mediasoup configuration**
   ```bash
   # In .env or ConfigMap
   MEDIASOUP_NUM_WORKERS=2
   ```

2. **Scale backend pods (Kubernetes)**
   ```bash
   kubectl scale deployment backend -n liveaudiocast --replicas=2
   ```

3. **Or scale with docker-compose**
   ```bash
   docker-compose up -d --scale backend=2
   ```

4. **Verify scaling**
   ```bash
   curl http://your-lb/health | jq '.mediasoup'
   # Should show 4 total workers (2 instances × 2 workers)
   ```

**Expected Results:**
- CPU per instance: 50-70%
- Memory per instance: 60-75%
- Latency: < 250ms

---

### Stage 3: 100-200 Concurrent Listeners

**Infrastructure Changes:**
- Scale to 3-4 backend instances
- Enable load balancer session affinity
- Add Redis Sentinel for HA

**Steps:**

1. **Enable Horizontal Pod Autoscaler (HPA)**
   ```bash
   kubectl apply -f infrastructure/k8s/backend-deployment.yaml
   # HPA will auto-scale from 3 to 20 pods based on CPU/Memory
   ```

2. **Configure session affinity on load balancer**
   ```yaml
   # For Kubernetes Service
   sessionAffinity: ClientIP
   sessionAffinityConfig:
     clientIP:
       timeoutSeconds: 3600
   ```

3. **Monitor scaling events**
   ```bash
   kubectl get hpa -n liveaudiocast -w
   ```

**Expected Results:**
- Auto-scaling triggers at 70% CPU
- New pods provisioned within 2 minutes
- Listener distribution balanced across instances

---

### Stage 4: 200-500 Concurrent Listeners (Add Relay Nodes)

**Infrastructure Changes:**
- Deploy relay nodes in multiple regions
- Enable geo-routing
- Implement regional SFU clusters

**Steps:**

1. **Enable relay activation**
   ```env
   RELAY_ACTIVATION_THRESHOLD=200
   ENABLE_RELAYS=true
   ```

2. **Deploy relay nodes**
   ```bash
   # For Kubernetes
   kubectl apply -f infrastructure/k8s/relay-deployment.yaml

   # Relay nodes are deployed per region:
   # - us-east-1
   # - eu-west-1
   # - ap-southeast-1
   ```

3. **Configure geo-routing**
   ```javascript
   // The ScalingOrchestrator automatically:
   // 1. Detects listener geo-location
   // 2. Routes to nearest relay
   // 3. Connects relay to origin SFU
   ```

4. **Verify relay operation**
   ```bash
   curl http://your-api/api/mediasoup/stats | jq '.relays'
   ```

**Relay Architecture:**

```
Origin SFU (Primary)
    │
    ├─→ Relay Node (us-east-1) → Listeners in NA
    ├─→ Relay Node (eu-west-1) → Listeners in EU
    └─→ Relay Node (ap-southeast-1) → Listeners in APAC
```

**Expected Results:**
- Origin SFU handles 50-100 direct connections
- Each relay handles 100-150 listeners
- Latency improvement for remote listeners (50-150ms reduction)
- Total capacity: 400-500 concurrent listeners

---

### Stage 5: 500-1000+ Concurrent Listeners (CDN + HLS)

**Infrastructure Changes:**
- Enable HLS transcoding
- Deploy CDN (CloudFront/Fastly)
- Implement hybrid delivery (WebRTC for interactive + HLS for passive)

**Steps:**

1. **Enable HLS transcoding**
   ```env
   HLS_ENABLED=true
   CDN_SWITCH_THRESHOLD=100
   CDN_URL=https://d123abc.cloudfront.net
   ```

2. **Configure CloudFront distribution**
   ```bash
   # The ScalingOrchestrator creates distribution automatically
   # Or manually via AWS Console/CLI

   aws cloudfront create-distribution \
     --origin-domain-name origin.liveaudiocast.com \
     --default-root-object index.m3u8
   ```

3. **Update DNS for CDN**
   ```bash
   # Point cdn.liveaudiocast.com to CloudFront domain
   cdn.liveaudiocast.com CNAME d123abc.cloudfront.net
   ```

4. **Monitor CDN activation**
   ```bash
   # Check logs for CDN activation events
   kubectl logs -n liveaudiocast deployment/backend | grep "cdn:activated"
   ```

**Hybrid Delivery Strategy:**

| Listener Type | Delivery Method | Latency | Capacity |
|--------------|-----------------|---------|----------|
| Host/Speakers | WebRTC Direct | < 200ms | 10-20 |
| Interactive Listeners | WebRTC via Relay | < 300ms | 200-300 |
| Passive Listeners | HLS via CDN | 2-5s | Unlimited |

**HLS Configuration:**

```javascript
// Segment duration: 2 seconds (balance latency vs. efficiency)
// Window size: 3 segments (6 seconds buffer)
// Variant bitrates:
// - 64 kbps (low quality, low bandwidth)
// - 128 kbps (standard quality)
```

**Expected Results:**
- Origin handles 50-100 WebRTC connections
- Relays handle 200-300 WebRTC connections
- CDN handles 500-1000+ HLS listeners
- Total cost increases linearly with CDN bandwidth, not listener count
- Latency: 200-300ms for WebRTC, 2-5s for HLS

---

## Operational Procedures

### Adding a Relay Node

```bash
# 1. Select target region
REGION=eu-west-1

# 2. Deploy relay pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: relay-${REGION}
  namespace: liveaudiocast
  labels:
    app: relay
    region: ${REGION}
spec:
  containers:
  - name: relay
    image: liveaudiocast-relay:latest
    env:
    - name: UPSTREAM
      value: "origin.liveaudiocast.svc.cluster.local"
    - name: REGION
      value: ${REGION}
EOF

# 3. Wait for ready
kubectl wait --for=condition=ready pod/relay-${REGION} -n liveaudiocast

# 4. Verify
kubectl logs -n liveaudiocast relay-${REGION}
```

### Activating CDN for a Broadcast

```bash
# Manually trigger CDN activation
curl -X POST http://your-api/api/broadcasts/{broadcastId}/activate-cdn \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Scaling Down

After a broadcast ends or listener count drops:

```bash
# 1. Mark instances for draining
kubectl annotate pod ${POD_NAME} -n liveaudiocast drain=true

# 2. Wait for connections to drain (max 60 seconds)

# 3. Scale down
kubectl scale deployment backend -n liveaudiocast --replicas=2

# 4. Remove relay nodes
kubectl delete pod -n liveaudiocast -l app=relay

# 5. Disable CDN (keeps distribution, stops origin)
# CDN distribution automatically cleaned up after 1 hour of inactivity
```

---

## Monitoring and Alerts

### Key Metrics

**Infrastructure:**
- CPU utilization per instance
- Memory utilization per instance
- Network bandwidth in/out
- Active pod count
- Pending HPA scale events

**Application:**
- Active broadcast count
- Total concurrent listeners
- WebRTC transport count
- HLS playlist requests/sec
- CDN cache hit ratio

**Performance:**
- P50, P95, P99 latency
- WebRTC packet loss rate
- Audio quality degradation events
- Reconnection rate

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| CPU | > 70% | > 85% | Scale up |
| Memory | > 75% | > 90% | Scale up or investigate leak |
| Listener count per instance | > 60 | > 80 | Add relay or enable CDN |
| Packet loss | > 2% | > 5% | Check network, reduce bitrate |
| Latency P95 | > 400ms | > 800ms | Add regional relay |
| Failed connections | > 5% | > 10% | Check mediasoup, firewall rules |

### Dashboards

Import Grafana dashboards from `infrastructure/monitoring/`:
- `backend-overview.json` - Backend health and performance
- `mediasoup-metrics.json` - WebRTC and media stats
- `broadcast-analytics.json` - Per-broadcast listener and engagement metrics

---

## Cost Analysis

### Cost Breakdown by Scale

**50 Listeners**
- Compute: 1 × t3.medium = $30/mo
- Database: RDS db.t3.micro = $15/mo
- Redis: ElastiCache t3.micro = $12/mo
- Bandwidth: 50 × 100 MB/hour × 10 hours × $0.09/GB = $4.50/mo
- **Total: ~$62/mo**

**200 Listeners**
- Compute: 3 × t3.large = $150/mo
- Database: RDS db.t3.small = $30/mo
- Redis: ElastiCache t3.small = $25/mo
- Bandwidth: 200 × 100 MB/hour × 20 hours × $0.09/GB = $36/mo
- **Total: ~$241/mo**

**1000 Listeners (with CDN)**
- Compute: 5 × t3.xlarge = $625/mo
- Database: RDS db.t3.medium = $60/mo
- Redis: ElastiCache t3.medium = $50/mo
- CloudFront: 1000 × 100 MB/hour × 30 hours × $0.085/GB = $255/mo
- S3 storage: 100 GB recordings = $2.30/mo
- **Total: ~$992/mo**

**Cost Optimization Tips:**
1. Use spot instances for non-critical relay nodes (40-60% savings)
2. Enable auto-scaling to scale down during off-peak
3. Use S3 Intelligent-Tiering for recordings
4. Implement CDN caching for popular broadcasts
5. Consider reserved instances for baseline capacity (30-50% savings)

---

## Disaster Recovery

### Backup Strategy

**Database:**
```bash
# Automated daily backups
pg_dump -h $DB_HOST -U postgres liveaudiocast | gzip > backup-$(date +%Y%m%d).sql.gz

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d).sql.gz s3://liveaudiocast-backups/db/
```

**Recordings:**
- S3 versioning enabled
- Cross-region replication to secondary region
- Lifecycle policy: Move to Glacier after 90 days

### Recovery Procedures

**Database Failure:**
```bash
# 1. Provision new RDS instance
# 2. Restore from latest backup
gunzip -c backup-20251115.sql.gz | psql -h $NEW_DB_HOST -U postgres liveaudiocast

# 3. Update backend configuration
kubectl set env deployment/backend -n liveaudiocast DB_HOST=$NEW_DB_HOST

# 4. Restart pods
kubectl rollout restart deployment/backend -n liveaudiocast
```

**Region Failure:**
```bash
# 1. Update DNS to failover region
# 2. Scale up instances in secondary region
kubectl config use-context eu-west-1
kubectl scale deployment backend -n liveaudiocast --replicas=10

# 3. Update CDN origin to new region
aws cloudfront update-distribution --id $DIST_ID --origin-domain-name eu.liveaudiocast.com
```

---

## Performance Testing

### Load Test Script

```bash
cd scripts/load-test
npm install

# Test 100 concurrent WebRTC listeners
node webrtc-pub-sub.js \
  --listeners 100 \
  --duration 300 \
  --broadcast-id test-broadcast-1 \
  --api-url http://localhost:4000

# Test 1000 HLS listeners
node hls-load-test.js \
  --listeners 1000 \
  --duration 600 \
  --hls-url https://cdn.liveaudiocast.com/test/index.m3u8
```

### Gradual Load Test

```bash
# Ramp from 10 to 500 listeners over 30 minutes
node gradual-load-test.js \
  --start 10 \
  --end 500 \
  --ramp-duration 1800 \
  --steady-duration 900
```

### Expected Results

| Listener Count | CPU% | Memory% | Latency P95 | Pass Criteria |
|----------------|------|---------|-------------|---------------|
| 50 | 40-50% | 50-60% | < 250ms | ✓ |
| 100 | 60-70% | 65-75% | < 300ms | ✓ |
| 200 | 70-80% | 75-85% | < 350ms | ✓ (with relay) |
| 500 | 50-60% | 60-70% | < 400ms | ✓ (with CDN) |
| 1000 | 40-50% | 50-60% | 2-5s HLS | ✓ (CDN only) |

---

## Troubleshooting

### High CPU on mediasoup

**Symptoms:** CPU > 80%, audio quality degradation

**Diagnosis:**
```bash
# Check worker load distribution
curl http://localhost:4000/api/mediasoup/stats

# Check active transports
```

**Resolution:**
1. Increase `MEDIASOUP_NUM_WORKERS`
2. Scale up instance size (more vCPU)
3. Enable relay nodes to distribute load
4. Switch high-load broadcasts to HLS

### CDN Not Activating

**Symptoms:** Listener count > threshold but still using WebRTC

**Diagnosis:**
```bash
# Check CDN configuration
echo $HLS_ENABLED
echo $CDN_SWITCH_THRESHOLD

# Check logs
kubectl logs -n liveaudiocast deployment/backend | grep cdn
```

**Resolution:**
1. Verify `HLS_ENABLED=true`
2. Check CloudFront distribution is created
3. Verify origin is reachable from CDN
4. Check S3 bucket permissions for HLS segments

### High Latency

**Symptoms:** P95 latency > 500ms

**Diagnosis:**
```bash
# Check listener geo-distribution
curl http://localhost:4000/api/broadcasts/{id}/stats

# Check relay nodes
kubectl get pods -n liveaudiocast -l app=relay
```

**Resolution:**
1. Deploy relay nodes in listener regions
2. Enable CDN with regional edge locations
3. Optimize mediasoup codec settings
4. Check network bandwidth and packet loss

---

## Conclusion

This runbook provides a clear path to scale LiveAudioCast from tens to thousands of listeners while maintaining performance and controlling costs. The key is the hybrid approach:

1. **0-200 listeners**: Pure WebRTC with horizontal scaling
2. **200-500 listeners**: Add relay nodes for geo-distribution
3. **500+ listeners**: Enable CDN + HLS for cost-effective massive scale

Always monitor metrics, test scaling procedures in staging, and have rollback plans ready.
