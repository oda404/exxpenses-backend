
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn } from "typeorm";
import { Category } from "./category";
import { ObjectType, Field, ID } from "type-graphql";
import { USERNAME_LENGTH } from "./types";

@ObjectType({ description: "The user model" })
@Entity()
export class User {
    @Field(type => ID)
    @PrimaryGeneratedColumn()
    id: number;

    @Field({ description: "The user's name" })
    @Column({ length: USERNAME_LENGTH })
    name: string;

    @Field({ description: "The user's email" })
    @Column({ unique: true })
    email: string;

    @Column()
    hash: string;

    /* When this user signed up */
    @Field(type => Date)
    @CreateDateColumn({ type: "timestamptz" })
    signup_date: Date;

    @Field(type => [Category])
    @OneToMany(() => Category, (category) => category.user)
    categories: Category[];
}
