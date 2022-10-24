
import {Matches, MaxLength, MinLength} from "class-validator";
import {USERNAME_LENGTH} from "../models/types";
import {Field, InputType, ObjectType} from "type-graphql";
import {User} from "../models/user";
import {GenericFieldError} from "./types";

const emailRegex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

@InputType()
export class RegisterUserInput implements Partial<User>
{
    @Field()
    name: string;

    @Field()
    email: string;

    @Field()
    password: string;
}

/* */
@ObjectType()
export class UserResponse
{
    @Field(() => User, { nullable: true })
    user?: User;

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
};
