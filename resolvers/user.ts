
import { User } from "../models/user";
import {Resolver, Arg, Query, Mutation} from "type-graphql";
import { userRepo } from "../server/data_source";

// TODO: maybe switch to libsodium
import { hash } from "argon2"
import {RegisterUserInput, UserResponse} from "./user_types";

/* All error handling is done manually (without the use of any decorators),
as decorators throw in case of errors, which gives the client an awkward json format,
which is pretty hard to parse and also may expose server info, so everything is handled
manually using UserResponse. */

@Resolver(User)
export class UserResolver
{
    @Mutation(() => User)
    async userRegister(
        @Arg("registerUserData") { name, email, password }: RegisterUserInput): Promise<UserResponse>
    {
        const partuser: Partial<User> = {
            name: name,
            email: email,
            hash: await hash(password),
        };

        return await userRepo.save(partuser);
    }

    @Query(() => String)
    async userLogin(

    ): Promise<String>
    {
        console.log(await userRepo.find());
        return "123";
    }
}
