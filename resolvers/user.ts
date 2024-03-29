
import { User } from "../models/user";
import { Resolver, Arg, Query, Mutation, Ctx } from "type-graphql";
// TODO: maybe switch to libsodium
import { hash as argon2_hash, verify as argon2_verify } from "argon2"
import { UserLoginInput, UserRegisterInput, UserResponse, UserSubscriptionInfo, UserSubscriptionPricing } from "./user_types";
import { QueryFailedError, Repository } from "typeorm";
import { USERNAME_LENGTH } from "../models/types";
import { ResolverContext } from "./types";
import { noReplyMailer } from "../server/mailer";
import Container from "typedi";
import generateEmailVerificationToken, { getEmailForVerificationTokenAndDelete } from "../utils/generateEmailVerificationToken";
import { generatePasswordRecoveryToken, getPasswordRecoveryEmail, getPasswordRecoveryEmailNoDelete } from "../utils/passwordRecovery";
import { turnstile_verify_managed } from "../utils/turnstile";
import development_reminder_ensure_logged_in from "./ensure_logged_in";
import is_currency_valid from "../utils/currency";
import { clear_user_session } from "../utils/user_session";
import { subscription_get_info, subscription_get_premium_pricing, subscription_unsubscribe_delayed } from "../payment/handle_subscription";

const frontend_url = process.env.FRONTEND_URL!;

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
    return name.length > 0 && name.length <= USERNAME_LENGTH;
}

function isPasswordValid(pass: string): boolean {
    return pass.length >= 8;
}

function isEmailValid(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return email.match(emailRegex) !== null && email.length > 0;
}

/**
 * All error handling is done manually (without the use of any decorators),
 * as decorators throw, which gives the client an awkward json format, that 
 * is pretty hard to parse and also may expose server info, so everything is 
 * handled manually using UserResponse. */
@Resolver(User)
export class UserResolver {

    private readonly userRepo = Container.get<Repository<User>>("psqlUserRepo");

    @Mutation(() => UserResponse, { description: "Register a new user." })
    async userRegister(
        @Ctx() { req }: ResolverContext,
        @Arg("registerUserData") { firstname, lastname, email, password, token }: UserRegisterInput
    ): Promise<UserResponse> {

        /* Trim strings */
        firstname = firstname.trim();
        lastname = lastname.trim();
        email = email.trim();
	email = email.toLowerCase();

        if (!isNameValid(firstname))
            return { error: { name: "Firstname can't be longer than 30 characters!", field: "firstname" } };

        if (!isNameValid(lastname))
            return { error: { name: "Lastname can't be longer than 30 characters!", field: "lastname" } };

        if (!isEmailValid(email))
            return { error: { name: "Invalid email address!", field: "email" } };

        if (!isPasswordValid(password))
            return { error: { name: "Password can't be shorter than 8 characters!", field: "password" } };

        if (!(await turnstile_verify_managed(token, req.headers)))
            return { error: { name: "Server error, plase try again. If the error persists, please contact support.", field: "token" } }; // Lets be nice to the user :)

        const partuser: Partial<User> = {
            firstname: firstname,
            lastname: lastname,
            email: email,
            hash: await argon2_hash(password),
        };

        try {
            let user = await this.userRepo.save(partuser);
            req.session.userId = user.id;
            return { user: user };
        }
        catch (e) {
            return psqlErrorToResponse(e);
        }
    }

    @Mutation(() => UserResponse, { description: "Create a session for a user." })
    async userLogin(
        @Ctx() { req }: ResolverContext,
        @Arg("loginUserData") { email, password, token }: UserLoginInput
    ): Promise<UserResponse> {

        email = email.trim();
	email = email.toLowerCase();

        const genericError = { error: { name: "Incorrect email or password!" } };

        if (!(await turnstile_verify_managed(token, req.headers)))
            return { error: { name: "Server error, plase try again. If the error persists, please contact support.", field: "token" } }; // Lets be nice to the user :)

        const user = await this.userRepo.findOneBy({ email: email });
        if (user === null)
            return genericError;

        if (!(await argon2_verify(user.hash, password)))
            return genericError;

        req.session.userId = user.id;

        return { user: user };
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async userLogout(
        @Ctx() { req, res }: ResolverContext
    ): Promise<boolean> {
        if (req.session.userId === undefined)
            return false;

        clear_user_session(req, res);
        return true;
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async userUpdatePreferredCurrency(
        @Ctx() { req, res }: ResolverContext,
        @Arg("preferred_currency") preferred_currency: string
    ) {
        if (req.session.userId === undefined)
            return false;

        preferred_currency = preferred_currency.trim();
        if (!is_currency_valid(preferred_currency))
            return false;

        const resp = await this.userRepo.update(req.session.userId, { preferred_currency: preferred_currency });
        if (resp.affected === 0) {
            // User may have been deleted by from another session
            clear_user_session(req, res);
            return false;
        }

        return true;
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async userSendVerificationEmail(
        @Ctx() { req, res }: ResolverContext
    ) {
        if (req.session.userId === undefined)
            return false;

        return this.userRepo.manager.transaction(async (transManager) => {
            const transUserRepo = transManager.getRepository(User);

            const user = await transUserRepo.findOneBy({ id: req.session.userId });
            if (user === null) {
                // User may have been deleted by from another session
                clear_user_session(req, res);
                return false;
            }

            if (user.verified_email)
                return false;

            const token = await generateEmailVerificationToken(user.email);
            const emailres = await noReplyMailer.sendMail({
                from: "Exxpenses <no-reply@exxpenses.com>",
                to: user.email,
                subject: "Verify your Exxpenses account",
                text: "Click on this button to confirm your Exxpenses account!",
                html: `
                    <div>
                        <a href="${frontend_url}/verify/${token}">Click to verify your Exxpenses account.</a>
                    </div>
                `
            })

            return true;
        })
    }

    @Mutation(() => Boolean)
    async userVerifyEmail(
        @Arg("token") token: string
    ) {
        const email = await getEmailForVerificationTokenAndDelete(token);
        if (email === null)
            return false;

        try {
            await this.userRepo.update(
                { email: email, verified_email: false },
                { verified_email: true }
            );
        }
        catch (e) {
            return false;
        }

        return true;
    }

    @Mutation(() => Boolean)
    async userRecoverPassword(
        @Ctx() { req }: ResolverContext,
        @Arg("email") email: string,
        @Arg("token") token: string
    ) {
        email = email.trim();
	email = email.toLowerCase();

        /* This function always returns true */
        if (!(await turnstile_verify_managed(token, req.headers)))
            return false;

        return this.userRepo.manager.transaction(async (transManager) => {
            const transUserRepo = transManager.getRepository(User);

            const user = await transUserRepo.findOneBy({ email: email });
            if (user === null)
                return true;

            const token = await generatePasswordRecoveryToken(email);

            noReplyMailer.sendMail({
                from: "Exxpenses <no-reply@exxpenses.com>",
                to: user.email,
                subject: "Password reset request",
                text: "Follow this link to create a new Exxpenses password",
                html: `
                    <div>
                        <div>A password reset request has been issued for this email.</div>
                        <div>If you haven't requested a password reset, please ignore this email.</div>
                        <a href="${frontend_url}/password-recover/${token}">Create a new password.</a>
                        <div>This link will expire after one hour.</div>
                    </div>
                `
            });

            return true;
        })
    }

    @Mutation(() => Boolean)
    async userSetPassword(
        @Arg("token") token: string,
        @Arg("password") new_password: string
    ) {
        const email = await getPasswordRecoveryEmail(token);
        if (email === null)
            return false;

        if (!isPasswordValid(new_password))
            return false;

        try {
            await this.userRepo.update(
                { email: email },
                { hash: await argon2_hash(new_password) }
            );
        }
        catch (e) {
            return false;
        }

        return true;
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async userDeleteAccount(
        @Ctx() { req }: ResolverContext,
        @Arg("password") password: string
    ) {
        if (req.session.userId === undefined)
            return false;

        try {
            const user = await this.userRepo.findOneBy({ id: req.session.userId });
            if (user === null)
                return false;

            if (!(await argon2_verify(user.hash, password)))
                return false;

            const res = await this.userRepo.delete({ id: req.session.userId });
            return res.affected === 1;
        }
        catch (e) {
            return false;
        }
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async userChangePassword(
        @Ctx() { req }: ResolverContext,
        @Arg("old_password") old_password: string,
        @Arg("password") password: string
    ) {
        if (req.session.userId === undefined)
            return false;

        try {
            const user = await this.userRepo.findOneBy({ id: req.session.userId });
            if (user === null)
                return false;

            if (!(await argon2_verify(user.hash, old_password)))
                return false;

            user.hash = await argon2_hash(password);
            const res = await this.userRepo.update({ id: user.id }, { hash: user.hash });
            return res.affected === 1;
        }
        catch (e) {
            return false;
        }
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async userUnsubscribe(
        @Ctx() { req, res }: ResolverContext,
    ) {
        if (req.session.userId === undefined)
            return false;

        const user = await this.userRepo.findOne({
            where: { id: req.session.userId },
            relations: ["stripe_user"]
        });

        if (user === null) {
            clear_user_session(req, res);
            return false;
        }

        if (user.plan === 0 || user.stripe_user === null || user.stripe_user.stripe_subid === null)
            return false;

        await subscription_unsubscribe_delayed(user.stripe_user.stripe_subid);
        return true;
    }

    @development_reminder_ensure_logged_in()
    @Query(() => UserResponse, { description: "Get the currently logged in user." })
    async userGet(
        @Ctx() { req, res }: ResolverContext
    ): Promise<UserResponse> {
        if (req.session.userId === undefined)
            return { error: { name: "Not signed in" } };

        const user = await this.userRepo.findOneBy({ id: req.session.userId });
        if (user === null) {
            clear_user_session(req, res);
            return { error: { name: "Internal server error" } };
        }

        return { user: user };
    }

    @Query(() => Boolean)
    async userIsPasswordResetTokenValid(
        @Arg("token") token: string
    ) {
        const email = await getPasswordRecoveryEmailNoDelete(token);
        return email !== null;
    }

    @development_reminder_ensure_logged_in()
    @Query(() => UserSubscriptionInfo, { nullable: true })
    async userGetSubscriptionInfo(
        @Ctx() { req, res }: ResolverContext,
    ): Promise<UserSubscriptionInfo | null> {
        if (req.session.userId === undefined)
            return null;

        const user = await this.userRepo.findOne({
            where: { id: req.session.userId },
            relations: ["stripe_user"]
        });
        if (user === null) {
            clear_user_session(req, res);
            return null;
        }

        if (user.plan === 0 || user.stripe_user === null || user.stripe_user.stripe_subid === null)
            return null;

        let response = await subscription_get_info(user.stripe_user.stripe_subid);
        if (response.price === undefined || response.since === undefined || response.until === undefined)
            return null

        return {
            since: new Date(response.since * 1000),
            until: new Date(response.until * 1000),
            price: response.price,
            cancel_at_end: response.cancel_at_end
        };
    }

    @Query(() => UserSubscriptionPricing, { nullable: true })
    async userGetPremiumSubscriptionPricing(): Promise<UserSubscriptionPricing | null> {
        const res = await subscription_get_premium_pricing();
        if (res?.price === undefined)
            return null;

        return {
            price: res?.price,
            discount_perc: res?.discount_perc
        }
    }
}
