
import "reflect-metadata";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { UserResolver } from "../resolvers/user";
import { CategoryResolver } from "../resolvers/category";
import { ExpenseResolver } from "../resolvers/expense";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { closePSQLConnection, initPSQLConnection } from "./psql";
import { customFormatError } from "./error_format";
import { ResolverContext } from "../resolvers/types";
import cors = require("cors");
import session from "express-session";
import connectRedis from "connect-redis";
const RedisStore = connectRedis(session);
import Redis from "ioredis";
import { readFileSync } from "fs";
import { exit } from "process";
import { ApolloServerPluginLandingPageDisabled } from "apollo-server-core";
import { Server as HTTPServer } from "http";
import { Server as HTTPSServer } from "https";
import { noReplyMailer } from "./mailer";
import { closeRedisConnection, initRedisConnection } from "./redis";
import { Container } from "typedi";

const env = process.env.ENV!;

const server_bind_address = process.env.SERVER_BIND_ADDRESS!;
const server_bind_port = process.env.SERVER_BIND_PORT!;
const frontend_url = process.env.FRONTEND_URL!;

const session_domain = process.env.SESSION_DOMAIN;
const session_secret = process.env.SESSION_SECRET!;

const https_key_path = process.env.HTTPS_KEY_PATH!;
const https_cert_path = process.env.HTTPS_CERT_PATH!;

async function new_apollo_server() {

    let plugins = [];
    if (env === "prod")
        plugins.push(ApolloServerPluginLandingPageDisabled())

    return new ApolloServer({
        schema: await buildSchema({
            resolvers: [
                UserResolver,
                CategoryResolver,
                ExpenseResolver
            ],
        }),
        plugins: plugins,
        context: ({ req, res }): ResolverContext => ({ req, res }),
        formatError: customFormatError,
        persistedQueries: false
    });
}

async function new_redis_store() {
    return new RedisStore({
        client: Container.get<Redis>("redisClient"),
    });
}

async function new_http_server() {

    console.log(`session: domain: ${session_domain}`);
    console.log(`session: secret length: ${session_secret.length}`);

    if (env === "prod" && session_secret.length < 128) {
        console.log("Server started in production mode but session secret is shorter than 128 characters!");
        exit(1);
    }

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
            domain: session_domain
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

    let server: HTTPServer | HTTPSServer;

    if (env === "prod") {
        console.log(`https: Reading ssl certificate from ${https_cert_path}`);
        console.log(`https: Reading ssl certificate key from ${https_key_path}`);

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

    console.log(`server: Environment is ${env}`);
    console.log(`server: Serving frontend ${frontend_url}`);

    /* Initialize the connection to Postgresql */
    await initPSQLConnection();

    /* Initialize connection to Redis server */
    await initRedisConnection();

    const server = await new_http_server();

    const port_number = Number(server_bind_port);
    server.listen(port_number, server_bind_address, () => {
        console.log(`server: Listening on ${server_bind_address}:${port_number}`);
    });

    process.on("SIGINT", () => {
        server.close(async () => {
            await closePSQLConnection();
            await closeRedisConnection();
            noReplyMailer.close();
            exit(1);
        })
    })
}

main();
