import Redis from "ioredis";
import Container from "typedi";
import { v4 as uuidv4 } from "uuid";
import uuidRegex from "./uuidRegex";

/* Generates and saves into redis a password recovery token */
export async function generatePasswordRecoveryToken(email: string) {
    const redisClient = Container.get<Redis>("redisClient");
    const token = uuidv4();

    await redisClient.set(`recovery:${token}`, email, "EX", 60 * 60);

    return token;
}

/* Find the email for the given token and delete it from redis. */
export async function getPasswordRecoveryEmailNoDelete(token: string) {

    const redisClient = Container.get<Redis>("redisClient");

    if (!uuidRegex.test(token))
        return null;

    return await redisClient.get(`recovery:${token}`);
}

/* Find the email for the given token and delete it from redis. */
export async function getPasswordRecoveryEmail(token: string) {

    const redisClient = Container.get<Redis>("redisClient");

    if (!uuidRegex.test(token))
        return null;

    return await redisClient.getdel(`recovery:${token}`);
}
