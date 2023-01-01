
import Redis from "ioredis";
import Container from "typedi";
import { v4 as uuidv4 } from "uuid";

const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

/* Generates and saves into redis a new email verification token for this specified email */
export default async function generateEmailVerificationToken(email: string) {

    const redisClient = Container.get<Redis>("redisClient");
    const token = uuidv4();

    await redisClient.set(`verify:${token}`, email, "EX", 60 * 60 * 24);

    return token;
}

// var incr = (function () {
//     var i = 1;

//     return function () {
//         return i++;
//     }
// })();

/* Find the email for the given token and delete it from redis. */
export async function getEmailForVerificationTokenAndDelete(token: string) {

    const redisClient = Container.get<Redis>("redisClient");

    if (!uuidRegex.test(token))
        return null;

    return await redisClient.getdel(`verify:${token}`);
}
