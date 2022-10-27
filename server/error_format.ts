
import { GraphQLError, GraphQLFormattedError } from "graphql";

export function customFormatError(error: GraphQLError): GraphQLFormattedError {
    let a: GraphQLFormattedError = {
        message: error.message,
        locations: error.locations,
        path: error.path,
    };
    return a;
}
