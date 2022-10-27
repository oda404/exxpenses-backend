
/* Used for letting the user know which field is wrong, if any. */
import { Field, ObjectType } from "type-graphql";
import { Session } from "express-session";
import { Request, Response } from "express";

export type ResolverContext = {
    req: Request & { session: Session & { userId?: number } };
    res: Response;
};

@ObjectType()
export class GenericFieldError {
    @Field()
    name: string;

    @Field({ nullable: true })
    field?: string;
};
