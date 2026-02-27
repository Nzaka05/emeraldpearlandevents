module.exports = {
    apps: [{
        name: "emerald-pearland-events",
        script: "./server-prod.js",
        instances: "max",
        exec_mode: "cluster",
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
            PORT: 3000
        }
    }]
}
