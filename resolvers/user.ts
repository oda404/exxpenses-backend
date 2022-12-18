
import { User } from "../models/user";
import { Resolver, Arg, Query, Mutation, Ctx } from "type-graphql";
import { userRepo } from "../server/data_source";

// TODO: maybe switch to libsodium
import { hash as argon2_hash, verify as argon2_verify } from "argon2"
import { UserLoginInput, UserRegisterInput, UserResponse } from "./user_types";
import { QueryFailedError } from "typeorm";
import { USERNAME_LENGTH } from "../models/types";
import { ResolverContext } from "./types";

/* Return an UserResponse based on the Postgres exception we are given. */
function psqlErrorToResponse(e: any): UserResponse {

    if (e instanceof QueryFailedError) {
        const code = e.driverError.code as string;
        const detail = e.driverError.detail as string;

        if (code === undefined || detail === undefined)
            return { error: { name: "Internal server error!" } };

        switch (code) {
            case '23505': // Unique key constraint violation
                const field = detail.substring(detail.indexOf('(') + 1, detail.indexOf(')'));
                return { error: { name: "Already in use", field: field } };

            default:
                break;
        }
    }

    return { error: { name: "Internal server error!" } };
}

function isNameValid(name: string): boolean {
    return name.length > 0 && name.length < USERNAME_LENGTH;
}

function isPasswordValid(pass: string): boolean {
    return pass.length > 0 && pass.length >= 8;
}

function isEmailValid(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return email.match(emailRegex) !== null;
}

/**
 * All error handling is done manually (without the use of any decorators),
 * as decorators throw, which gives the client an awkward json format, that 
 * is pretty hard to parse and also may expose server info, so everything is 
 * handled manually using UserResponse. */
@Resolver(User)
export class UserResolver {

    @Mutation(() => UserResponse, { description: "Register a new user." })
    async userRegister(
        @Arg("registerUserData") { firstname, lastname, email, password }: UserRegisterInput
    ): Promise<UserResponse> {

        /* Trim strings */
        firstname = firstname.trim();
        lastname = lastname.trim();
        email = email.trim();

        if (!isNameValid(firstname))
            return { error: { name: "Firstname can't be longer than 30 characters!", field: "firstname" } };

        if (!isNameValid(lastname))
            return { error: { name: "Lastname can't be longer than 30 characters!", field: "lastname" } };

        if (!isEmailValid(email))
            return { error: { name: "Invalid email address!", field: "email" } };

        if (password.includes(' '))
            return { error: { name: "Password contains invalid characters!", field: "password" } }

        if (!isPasswordValid(password))
            return { error: { name: "Password can't be shorter than 8 characters!", field: "password" } };

        const partuser: Partial<User> = {
            firstname: firstname,
            lastname: lastname,
            email: email,
            hash: await argon2_hash(password),
        };

        try {
            return { user: await userRepo.save(partuser) };
        }
        catch (e) {
            return psqlErrorToResponse(e);
        }
    }

    @Mutation(() => UserResponse, { description: "Create a session for a user." })
    async userLogin(
        @Ctx() { req }: ResolverContext,
        @Arg("loginUserData") { email, password }: UserLoginInput
    ): Promise<UserResponse> {

        email = email.trim();

        const genericError = { error: { name: "Incorrect email or password!" } };

        if (!isEmailValid(email) || !isPasswordValid(password))
            return genericError;

        const user = await userRepo.findOneBy({ email: email });
        if (user === null)
            return genericError;

        if (!(await argon2_verify(user.hash, password)))
            return genericError;

        req.session.userId = user.id;

        return { user: user };
    }

    @Mutation(() => Boolean)
    async userLogout(
        @Ctx() { req, res }: ResolverContext
    ): Promise<boolean> {

        if (req.session.userId === undefined)
            return false;

        /* FIXME: somehow wait for destroy to finish before returning. */
        req.session.destroy(() => { });
        res.clearCookie("user_session");

        return true;
    }

    @Mutation(() => Boolean)
    async userUpdatePreferredCurrency(
        @Ctx() { req, res }: ResolverContext,
        @Arg("preferred_currency") preferred_currency: string
    ) {
        if (req.session.userId === undefined)
            return false;

        preferred_currency = preferred_currency.trim();

        // TODO: currency validation

        const resp = await userRepo.update({ id: req.session.userId }, { preferred_currency: preferred_currency });

        if (resp.affected === 0) {
            // No user
            req.session.destroy(() => { })
            res.clearCookie("user_session");
            return false;
        }

        return true;
    }

    @Query(() => UserResponse, { description: "Get the currently logged in user." })
    async userGet(
        @Ctx() { req, res }: ResolverContext
    ): Promise<UserResponse> {

        const id = req.session.userId;
        if (id === undefined)
            return { error: { name: "Not signed in" } };

        const user = await userRepo.findOneBy({ id: id });
        if (user === null) {
            req.session.destroy(() => { });
            res.clearCookie("user_session");
            return { error: { name: "Internal server error" } };
        }

        return { user: user };
    }
}
