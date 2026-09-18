// PM2 cluster mode: Runs multiple worker processes on the same server.
// Important: REDIS_URL must be configured in the environment before startup
// with instances > 1, so that all workers share the same cache (Redis).
// Without REDIS_URL, each worker would use a separate local cache,
// which could lead to data inconsistencies across requests.
module.exports = {
  apps: [{
    name: 'store-app',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    }
  }]
};