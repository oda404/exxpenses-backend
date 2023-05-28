import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from "typeorm";
import { User } from "./user";

@Entity({ name: "stripe_users" })
export class StripeUser {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ nullable: false })
    stripe_cusid: string;

    @Column({ nullable: true })
    stripe_subid: string;
}