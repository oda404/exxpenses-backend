import { Field, InputType, ObjectType } from "type-graphql";
import { Category } from "../models/category";
import { GenericFieldError } from "./types";

@InputType()
export class CategoryAddInput implements Partial<Category>
{
    @Field()
    name: string;

    @Field()
    default_currency: string;
}

@InputType()
export class CategoryEditInput implements Partial<Category> {

    @Field()
    id: string;

    @Field()
    name: string;

    @Field()
    default_currency: string;
}

@ObjectType()
export class CategoryResposne {
    @Field(() => [Category], { nullable: true })
    categories?: Category[];

    @Field(() => GenericFieldError, { nullable: true })
    error?: GenericFieldError;
}
