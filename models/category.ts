
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToOne, Unique, UpdateDateColumn } from "typeorm";
import { Expense } from "./expense";
import { User } from "./user";
import { CATEGORY_NAME_LENGTH, CURRENCY_LENGTH } from "./types";
import { Field, ObjectType, ID } from "type-graphql";

@ObjectType({ description: "The category model" })
@Entity({ name: "categories" })
/* The name and the user together are unique: i.e. one user can only have uniquely named categories */
@Unique(["name", "user"])
export class Category {
    @Field(() => ID)
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Field({ description: "The category's name" })
    @Column({ length: CATEGORY_NAME_LENGTH })
    name: string;

    @Field({ description: "The category's default curreny" })
    @Column({ length: CURRENCY_LENGTH })
    default_currency: string;

    @Field({ description: "Last update for this category" })
    @UpdateDateColumn({ type: "timestamptz" })
    last_update: Date;

    // The owner of this category. When the user is deleted all of their categories are also deleted.
    @ManyToOne(() => User, (user) => user.categories, { onDelete: "CASCADE" })
    user: User;

    @OneToMany(() => Expense, (expense) => expense.category)
    expenses: Expense[]

    expenseCount?: number;
}
