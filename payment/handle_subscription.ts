import Container from "typedi";
import { Repository } from "typeorm";
import { User } from "../models/user";
import { PlanType } from "../utils/plan";
import { stripe } from "./routes";
import { UserSubscriptionPricing } from "../resolvers/user_types";

const premium_id = process.env.STRIPE_PREMIUM_ID!;

let userRepo: Repository<User>;

export async function subscriptions_subsystem_init() {
    userRepo = Container.get<Repository<User>>("psqlUserRepo");
}

export async function handle_subscription_set_to(email: string, value: number, sub_id: string) {

    try {
        const user = await userRepo.findOneBy({ email: email });
        if (user === null)
            return;

        // probably an old subscription talking mad shit
        if (user.stripe_subid !== null && user.stripe_subid !== sub_id && value <= user.plan)
            return null;

        await userRepo.update({ email: email }, { plan: value as PlanType, stripe_subid: sub_id });
    }
    catch (e) {

    }
}

export async function subscription_get_info(subid: string) {
    try {
        const sub = await stripe.subscriptions.retrieve(subid);
        return {
            since: sub.current_period_start,
            until: sub.current_period_end,
            price: (sub as any).plan.amount,
            cancel_at_end: sub.cancel_at_period_end
        }
    }
    catch (e) {
        return {}
    }
}

export async function subscription_unsubscribe_delayed(subid: string) {
    try {
        const subscription = await stripe.subscriptions.update(subid, { cancel_at_period_end: true });
    }
    catch (e) {

    }
}

export async function subscription_get_premium_pricing(): Promise<UserSubscriptionPricing | null> {
    const res = await stripe.products.retrieve(premium_id);
    if (!res.default_price)
        return null;

    const price = await stripe.prices.retrieve(res.default_price as string);
    if (price.unit_amount === null)
        return null;

    return {
        price: price.unit_amount
    }
}
