
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
}

@InputType()
export class UserLoginInput implements Partial<User>
{
    @Field()
    email: string;

    @Field()
    password: string;
};

/* */
@ObjectType()
export class UserResponse {
    @Field(() => User, { nullable: true })
    user?: User;

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
};
