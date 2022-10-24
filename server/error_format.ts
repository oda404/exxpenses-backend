
import {GraphQLError, GraphQLFormattedError} from "graphql";

function errorMessageToClientMessage(msg: string): string
{
    if(msg.startsWith("duplicate key"))
    {
        // It's comming from SQL
        return "Already exists";
    }
    else
    {
        return msg;
    }
}

export function customFormatError(error: GraphQLError): GraphQLFormattedError
{
    console.log(error);
    let a: GraphQLFormattedError = {
        message: errorMessageToClientMessage(error.message),
        locations: error.locations,
        path: error.path,
        extensions: error.extensions?.exception.validationErrors
    };
    return a;
}
