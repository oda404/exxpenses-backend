
import "reflect-metadata";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { UserResolver } from "../resolvers/user";
import { CategoryResolver } from "../resolvers/category";
import { ExpenseResolver } from "../resolvers/expense";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { exxpensesDataSource } from "./data_source";
import { customFormatError } from "./error_format";
import { ResolverContext } from "../resolvers/types";
import cors = require("cors");
import session from "express-session";
import connectRedis from "connect-redis";
const RedisStore = connectRedis(session);
import Redis from "ioredis";
import { readFileSync } from "fs";

const env = process.env.ENV!;
const port = process.env.PORT!;
const frontend_url = process.env.FRONTEND_URL!;

const redis_host = process.env.REDIS_HOST!;
const redis_port = process.env.REDIS_PORT!;
const redis_pass = process.env.REDIS_PASS!;

const session_secret = process.env.SESSION_SECRET!;

const https_key_path = process.env.HTTPS_KEY_PATH!;
const https_cert_path = process.env.HTTPS_CERT_PATH!;

async function new_apollo_server() {
    return new ApolloServer({
        schema: await buildSchema({
            resolvers: [
                UserResolver,
                CategoryResolver,
                ExpenseResolver
            ],
        }),
        context: ({ req, res }): ResolverContext => ({ req, res }),
        formatError: customFormatError,
    });
}

async function new_redis_store() {
    let redisClient = new Redis({
        host: redis_host,
        port: Number(redis_port),
        password: redis_pass,
        lazyConnect: true
    });

    await redisClient.connect();

    return new RedisStore({
        client: redisClient,
    });
}

async function new_http_server() {
    /* Creat express server */
    const app = express();
    const redisStore = await new_redis_store();

    app.use(cors({
        origin: frontend_url,
        credentials: true
    }));

    /* Cookies middleware */
    app.use(session({
        name: "user_session",
        store: redisStore,
        cookie: {
            path: "/",
            httpOnly: true,
            secure: env === "prod",
            maxAge: 1000 * 60 * 60 * 24 * 4, // 4 days
            sameSite: "lax",
        },
        secret: session_secret,
        resave: false,
        saveUninitialized: false,
    }));

    /* Create and start the apollo server */
    const apollo_middleware = await new_apollo_server()
    await apollo_middleware.start();

    /* Add apollo as a middleware to express */
    apollo_middleware.applyMiddleware({ app, cors: false, path: "/" });

    let server: any;

    if (env === "prod") {
        server = createHttpsServer(
            {
                key: readFileSync(https_key_path),
                cert: readFileSync(https_cert_path)
            },
            app
        );
    }
    else {
        server = createHttpServer(app);
    }

    return server;
}

async function main() {

    /* Initialize the connection to Postgresql */
    await exxpensesDataSource.initialize();

    const server = await new_http_server();

    const port_number = Number(port);
    server.listen(port_number, () => {
        console.log(`server started on ${port_number}`);
    });
}

main();
