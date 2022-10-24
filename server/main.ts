
import "reflect-metadata";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { UserResolver } from "../resolvers/user";
import { createServer as createHttpServer } from "http";
import { exxpensesDataSource } from "./data_source";
import { customFormatError } from "./error_format";

async function new_apollo_server() {
    return new ApolloServer({
        schema: await buildSchema({
            resolvers: [
                UserResolver
            ]
        }),
        formatError: customFormatError,
    });
}

async function new_http_server() {
    /* Creat express server */
    const app = express();

    /* Create and start the apollo server */
    const apollo_middleware = await new_apollo_server()
    await apollo_middleware.start();

    /* Add apollo as a middleware to express */
    apollo_middleware.applyMiddleware({ app })

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
