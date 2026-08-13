/**
 * Worker pool manager.
 * Creates one mediasoup Worker per CPU core (capped at 4 for dev).
 * Workers are used round-robin for Router creation.
 */

const mediasoup = require("mediasoup");
const os = require("os");

const NUM_WORKERS = Math.min(os.cpus().length, 4);
const workers = [];
let workerIdx = 0;

/**
 * Initialise all Workers at startup.
 * @returns {Promise<void>}
 */
async function createWorkers() {
  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: process.env.LOG_LEVEL || "warn",
      logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
      rtcMinPort: parseInt(process.env.RTC_MIN_PORT || "10000"),
      rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || "10100"),
    });

    worker.on("died", (err) => {
      console.error(`mediasoup Worker ${i} died:`, err);
      // In production, restart the process or create a new worker
      process.exit(1);
    });

    workers.push(worker);
    console.log(`✅ Worker ${i + 1}/${NUM_WORKERS} created (pid: ${worker.pid})`);
  }
}

/**
 * Round-robin worker selector.
 * @returns {mediasoup.Worker}
 */
function getWorker() {
  const worker = workers[workerIdx % workers.length];
  workerIdx = (workerIdx + 1) % workers.length;
  return worker;
}

module.exports = { createWorkers, getWorker };
