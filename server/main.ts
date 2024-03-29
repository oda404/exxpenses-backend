
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
import connectRedis from "connect-redis";
import session from "express-session";
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
import payment_create_route, { payment_webhook, subscriptions_subsystem_routes_init } from "../payment/routes";
import { subscriptions_subsystem_init } from "../payment/handle_subscription";
var body = require("body-parser")

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

function new_redis_store() {
    return new RedisStore({
        client: Container.get<Redis>("redisClient"),
        disableTouch: false,
        ttl: 1000 * 60 * 60 * 24 * 4 // 4 days
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

    app.use(cors({
        origin: frontend_url,
        credentials: true,
    }));

    /* Cookies middleware */
    app.use(session({
        name: "user_session",
        store: new_redis_store(),
        cookie: {
            path: "/",
            httpOnly: true,
            secure: env === "prod",
            maxAge: 1000 * 60 * 60 * 24 * (365 / 2), // 6 months
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

    app.post("/rest/create-subscribe-intent", body.json(), payment_create_route);
    app.post("/rest/subscribe-webhook", body.raw({ type: 'application/json' }), payment_webhook);

    /* Add apollo as a middleware to express */
    apollo_middleware.applyMiddleware({ app, cors: false, path: "/gql" });

    let server: HTTPServer | HTTPSServer;
    server = createHttpServer(app);
    return server;
}

async function main() {

    console.log(`server: Environment is ${env}`);
    console.log(`server: Serving frontend ${frontend_url}`);

    /* Initialize the connection to Postgresql */
    await initPSQLConnection();

    /* Initialize connection to Redis server */
    await initRedisConnection();

    await subscriptions_subsystem_routes_init();
    await subscriptions_subsystem_init();
    const server = await new_http_server();

    const port_number = Number(server_bind_port);
    server.listen(port_number, server_bind_address, () => {
        console.log(`server: Listening on ${server_bind_address}:${port_number}`);
    });

    process.on("exit", () => {
        server.close(async () => {
            await closePSQLConnection();
            await closeRedisConnection();
            noReplyMailer.close();
        });
    })
}

main();
