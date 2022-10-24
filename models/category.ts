
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToOne  } from "typeorm";
import { Expense } from "./expense";
import { User } from "./user";
import {CATEGORY_NAME_LENGTH, CURRENCY_LENGTH} from "./types";
import {Field, ObjectType, ID} from "type-graphql";

@ObjectType({ description: "The category model"})
@Entity()
export class Category
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
    id: number;

    @Field({ description: "The category's name" })
    @Column({ length: CATEGORY_NAME_LENGTH })
    name: string;

    @Field({ description: "The category's default curreny" })
    @Column({ length: CURRENCY_LENGTH })
    default_currency: string;

    // The owner of this category
    @ManyToOne(() => User, (user) => user.categories)
    user: User;

    @Field(type => [Expense])
    // The expenses in this category
    @OneToMany(() => Expense, (expense) => expense.category)
    expenses: Expense[]
}
