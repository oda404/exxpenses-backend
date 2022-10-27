
import "reflect-metadata";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { UserResolver } from "../resolvers/user";
import { createServer as createHttpServer } from "http";
import { exxpensesDataSource } from "./data_source";
import { customFormatError } from "./error_format";
import session = require("express-session");
import { ResolverContext } from "../resolvers/types";
import cors = require("cors");

async function new_apollo_server() {
    return new ApolloServer({
        schema: await buildSchema({
            resolvers: [
                UserResolver
            ]
        }),
        context: ({ req, res }): ResolverContext => ({ req, res }),
        formatError: customFormatError,
    });
}

async function new_http_server() {
    /* Creat express server */
    const app = express();

    app.use(cors({
        origin: "http://localhost:3000",
        credentials: true
    }));

    /* Cookies middleware */
    app.use(session({
        name: "user_session",
        cookie: {
            path: "/",
            httpOnly: true,
            secure: false,
            maxAge: undefined,
            sameSite: "lax"
        },
        secret: "penis secret",
        resave: false,
        saveUninitialized: false,
    }));

    /* Create and start the apollo server */
    const apollo_middleware = await new_apollo_server()
    await apollo_middleware.start();

    /* Add apollo as a middleware to express */
    apollo_middleware.applyMiddleware({ app, cors: false, path: "/" })

    return createHttpServer(app);
}

async function main() {
    /* Initialize the connection to Postgresql */
    await exxpensesDataSource.initialize();

    const server = await new_http_server();
    server.listen(8888, () => {
        console.log("server started on 8888");
    });
}

main();
