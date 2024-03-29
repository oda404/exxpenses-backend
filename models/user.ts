
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { Category } from "./category";
import { ObjectType, Field, ID } from "type-graphql";
import { CURRENCY_LENGTH, USERNAME_LENGTH } from "./types";
import { PLAN_FREE, PlanType } from "../utils/plan";
import { StripeUser } from "./stripe_user";

@ObjectType({ description: "The user model" })
@Entity({ name: "users" })
export class User {
    @Field(type => ID)
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Field({ description: "The user's firstname" })
    @Column({ length: USERNAME_LENGTH })
    firstname: string;

    @Field({ description: "The user's lastname" })
    @Column({ length: USERNAME_LENGTH })
    lastname: string;

    @Field({ description: "The user's email" })
    @Column({ unique: true })
    email: string;

    @Field({ description: "True if the user has verified their email address" })
    @Column({ default: false })
    verified_email: boolean;

    @Field({ description: "The user's phone number" })
    @Column({ nullable: true, default: null })
    phone_number: string;

    @Field({ description: "The user's preferred currency", nullable: true })
    @Column({ length: CURRENCY_LENGTH, nullable: true })
    preferred_currency: string;

    @Field({ description: "The user's plan" })
    @Column({ default: PLAN_FREE })
    plan: PlanType;

    @Column()
    hash: string;

    @Field(type => Date)
    @CreateDateColumn({ type: "timestamptz" })
    signup_date: Date;

    @Field(type => [Category])
    @OneToMany(() => Category, (category) => category.user)
    categories: Category[];

    @OneToOne(() => StripeUser, { nullable: true, cascade: true })
    @JoinColumn()
    stripe_user: StripeUser | null;

    @Column({ nullable: true, default: null })
    referral_code?: string;

    categoryCount?: number;
}
