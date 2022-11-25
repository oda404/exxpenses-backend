import { Field, InputType, ObjectType } from "type-graphql";
import { Expense } from "../models/expense";
import { GenericFieldError } from "./types";

@InputType()
export class ExpenseAddInput implements Partial<Expense>
{
    @Field()
    category_name: string;

    @Field()
    price: number;

    @Field(() => String, { nullable: true })
    description: string | undefined;

    @Field()
    currency: string;

    @Field()
    date: Date;
}

@InputType()
export class ExpensesGetInput {
    @Field()
    category_name: string;

    @Field({ nullable: true })
    since?: Date;

    @Field({ nullable: true })
    until?: Date;
}

@InputType()
export class ExpensesGetInputMultiple {
    @Field(() => [String])
    category_names: string[];

    @Field({ nullable: true })
    since?: Date;

    @Field({ nullable: true })
    until?: Date;
}

@InputType()
export class ExpenseDeleteInput {
    @Field()
    expense_id: string;

    @Field()
    category_name: string;
}

@InputType()
export class ExpenseEditInput {
    @Field()
    category_name: string;

    @Field()
    expense_id: string;

    @Field()
    price: number;

    @Field()
    currency: string;

    @Field()
    date: Date;
}

@ObjectType()
export class ExpenseResponse {
    @Field(() => [Expense], { nullable: true })
    expenses?: Expense[];

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
}

@ObjectType()
export class ExpenseTotalCost {
    @Field(() => Number)
    price: number;

    @Field(() => String)
    currency: string;
}

@ObjectType()
export class ExpensesCostResponse {
    @Field(() => [ExpenseTotalCost], { nullable: true })
    costs?: ExpenseTotalCost[];

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
}

@ObjectType()
export class ExpenseTotalCostMultiple {
    @Field(() => String)
    category_name: string;

    @Field(() => [ExpenseTotalCost])
    total: ExpenseTotalCost[];
}

@ObjectType()
export class ExpensesCostResponseMultiple {
    @Field(() => [ExpenseTotalCostMultiple], { nullable: true })
    costs?: ExpenseTotalCostMultiple[];

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
}
