import { NextFunction, Request, Response } from "express";
import Stripe from "stripe";
import { handle_subscription_set_to } from "./handle_subscription";
import Container from "typedi";
import { Repository } from "typeorm";
import { User } from "../models/user";
import { StripeUser } from "../models/stripe_user";

const stripe_whsec = process.env.STRIPE_WHSEC!;
const stripe_pk = process.env.STRIPE_PK!;
const stripe_prices = process.env.STRIPE_PRICES!;
export const stripe = new Stripe(stripe_pk, {
    apiVersion: "2022-11-15"
});

const stripe_price_map = stripe_prices.split(',').map(price => {
    let obj = price.split('=');
    return { stripe_id: obj[0], internal_id: Number(obj[1]) };
});

let userRepo: Repository<User>;
let stripeUserRepo: Repository<StripeUser>;
export async function subscriptions_subsystem_routes_init() {
    userRepo = Container.get<Repository<User>>("psqlUserRepo");
    stripeUserRepo = Container.get<Repository<StripeUser>>("psqlStripeUserRepo");
}

// const subscription = await stripe.subscriptions.cancel('sub_49ty4767H20z6a');

export default async function payment_create_route(req: Request, res: Response, next: NextFunction) {
    let { email, price_id } = req.body;

    if (email === undefined || price_id === undefined)
        return;

    try {
        const user = await userRepo.findOne({ where: { email: email }, relations: ["stripe_user"] });
        if (user === null)
            return;

        let customer_id;
        if (user.stripe_user === null) {
            const customer = await stripe.customers.create({
                email: email,
            });
            let stripe_user: Partial<StripeUser> = {
                stripe_cusid: customer.id
            };

            user.stripe_user = await stripeUserRepo.save(stripe_user);
            await userRepo.update({ email: user.email }, { stripe_user: user.stripe_user });

            customer_id = stripe_user.stripe_cusid!;
        }
        else {
            customer_id = user.stripe_user.stripe_cusid;
        }

        let p = await stripe.subscriptions.create({
            customer: customer_id,
            items: [{
                price: price_id
            }],
            expand: ['latest_invoice.payment_intent'],
            payment_behavior: "default_incomplete",
        });

        let latest = p.latest_invoice! as any;
        return res.status(200).json({ client_secret: latest.payment_intent.client_secret });
    }
    catch (e) {
        return res.status(400).json({ error: "Internal server error" })
    }
}

export async function payment_webhook(req: Request, res: Response, next: NextFunction) {
    let payload = req.body;
    let hdr = req.headers['stripe-signature'];
    if (hdr === undefined)
        return res.status(400).send(`Webhook Error.`);

    let event;

    try {
        event = stripe.webhooks.constructEvent(payload, hdr, stripe_whsec);
    }
    catch (err: any) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'customer.subscription.updated') {
            let sub = event.data.object as any;
            const sub_id = sub.id;

            const customer = await stripe.customers.retrieve((event.data.object as any).customer) as any;
            const customer_email = customer.email;

            switch (sub.status) {
                case "active":
                case "trialing":
                    const invoice = await stripe.invoices.retrieve((event.data.object as any).latest_invoice) as any;
                    const price_id = invoice.lines.data[0].price.id;
                    handle_subscription_set_to(customer_email, stripe_price_map.find(p => p.stripe_id === price_id)!.internal_id, sub_id);
                    break;

                default:
                    handle_subscription_set_to(customer_email, 0, sub_id);
                    break;
            }
        }
        else if (event.type === "customer.subscription.deleted") {
            let sub = event.data.object as any;
            const sub_id = sub.id;
            const customer = await stripe.customers.retrieve((event.data.object as any).customer) as any;
            const customer_email = customer.email;
            handle_subscription_set_to(customer_email, 0, sub_id);
        }
        else if (event.type === 'invoice.upcoming') {

        }
    }
    catch (e) {
        return res.status(500).end();
    }

    return res.status(200).end();
}
