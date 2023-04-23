import Redis from "ioredis";
import Container from "typedi";

const redis_host = process.env.REDIS_HOST!;
const redis_port = process.env.REDIS_PORT!;
const redis_pass = process.env.REDIS_PASS!;

export async function initRedisConnection() {

    const redis_pass_len = redis_pass.length;
    console.log(`redis: Connecting to ${redis_host}:${redis_port}`);
    console.log(`redis: Password length: ${redis_pass_len}, ending in "${redis_pass.substring(redis_pass_len - 3)}"`);

    const redisClient = new Redis({
        host: redis_host,
        port: Number(redis_port),
        password: redis_pass,
        lazyConnect: true
    });
    await redisClient.connect();
    Container.set("redisClient", redisClient);
}

export async function closeRedisConnection() {
    const redisClient = Container.get<Redis>("redisClient");
    await redisClient.quit();
    Container.remove("redisClient");
}
