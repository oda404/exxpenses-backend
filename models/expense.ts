
import {Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn} from "typeorm";
import { Category } from "./category";
import {CURRENCY_LENGTH, EXPENSE_DESCRIPTION_LENGTH} from "./types";
import {Field, ObjectType, ID} from "type-graphql";

@ObjectType({description: "The expesne model"})
@Entity()
export class Expense
{
    @Field(() => ID)
    @PrimaryGeneratedColumn()
    id: number;

    @Field({ description: "This expenses' description", nullable: true })
    @Column({ length: EXPENSE_DESCRIPTION_LENGTH, nullable: true })
    description?: string;

    @Field({ description: "This expenses' price" })
    @Column({ type: "decimal", precision: 2 })
    price: number;

    @Field({ description: "This expenses' prefered currency" })
    /* 10 characters for supporting more than real-world currencies eg: SHIB */
    @Column({ length: CURRENCY_LENGTH })
    currency: string;

    @Field({ description: "When this expense was made" })
    @CreateDateColumn({ type: "timestamptz" })
    date: Date;

    /* This expenses' category */
    @ManyToOne(() => Category, (category) => category.expenses)
    category: Category;
}
