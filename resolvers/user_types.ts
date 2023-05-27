
import { Field, InputType, ObjectType } from "type-graphql";
import { User } from "../models/user";
import { GenericFieldError } from "./types";

@InputType()
export class UserRegisterInput implements Partial<User>
{
    @Field()
    firstname: string;

    @Field()
    lastname: string;

    @Field()
    email: string;

    @Field()
    password: string;

    @Field()
    token: string;
}

@InputType()
export class UserLoginInput implements Partial<User>
{
    @Field()
    email: string;

    @Field()
    password: string;

    @Field()
    token: string;
};

/* */
@ObjectType()
export class UserResponse {
    @Field(() => User, { nullable: true })
    user?: User;

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
};

@ObjectType()
export class UserSubscriptionInfo {
    @Field()
    since: Date;

    @Field()
    until: Date;

    @Field()
    price: number;

    @Field()
    cancel_at_end: boolean;
}
